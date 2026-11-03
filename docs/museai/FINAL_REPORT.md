# Muse final reply / “report” missing from BotHub chat

**Symptom (user):** send message → Muse answers quickly → works a long time → final “回复报告” never appears in the BotHub transcript.

**Confidence:** **high** for event names and official reducer behavior; **high** for BotHub native drop paths in `muse-native/chat.ts`; **medium** for which exact product surface Muse calls a “report” (often a **second** assistant message and/or `option` / `text_with_button` / presentation widgets after a long tool run).

---

## 1. What the wire actually sends

Long turns are **multi-message**, not one giant stream:

1. Early assistant bubble(s): `delta.message_start` → `delta.text_append`* → `delta.message_done` (+ often `message.assistant`).
2. While working: many `agent.status` (`activity_text` updates) and `delta.tool_start` / `delta.tool_done`.
3. Final “report” is typically **another** assistant message with a **new** `message_id`:
   - again `delta.message_start` … `delta.message_done` / `message.assistant`, and/or
   - `delta.presentation` / widgets on the message (`option`, `text_with_button`, markdown carrier, etc.).

History backfill uses the same `event_name`s inside `chat.history` / `chat.history_window` → `chat_events[]`.

**Key official handlers** (`js/1p-4zwr-bo7um.js`):  
`delta.message_start|text_append|message_done`, `message.assistant`, `delta.presentation`, `delta.placeholder`, `delta.tool_*`, `agent.status`, `widget.state_updated`.

Statuses on `delta.message_done`: `complete` / `completed` / `failed` / `interrupted` / …  
Official may **remove** an interrupted empty stub; completed messages get `isTextStreaming:false` and full `content` / widgets.

---

## 2. Why BotHub drops the final report

Primary implementation under analysis: `/workspace/mn/src/main/muse-native/chat.ts` (`streamChat`).

### 2.1 Idle settle after the **first** completed bubble — **high**

```ts
// on delta.message_done / message.assistant:
armIdle()  // default idleMs = 4000 → settle() ends streamChat
```

After the early “I’m on it” reply completes, a 4s quiet window (no further handled events) **resolves the whole turn**. Later `delta.message_start` for the report is ignored because listeners are already removed in `finally`.

`agent.status` can also `settle()` when `activity_code === "online"` once `doneIds.size === order.length` — fine for true idle, **dangerous** if “online” flaps between phases (**medium**).

### 2.2 Only tracks message ids seen via `delta.message_start` — **high**

```ts
case 'message.assistant':
case 'delta.message_done':
  if (!started || !id || !texts.has(id) || doneIds.has(id)) break
```

A late `message.assistant` / `message_done` for a **new** id never entered `texts` via `message_start` → **dropped**.  
History backfill only iterates `order` (ids from this turn’s starts), so it will not invent the missing report id unless that id was already started before disconnect.

### 2.3 Event allowlist too narrow — **high**

```ts
if (!e.name.startsWith('delta.') && e.name !== 'message.user'
    && e.name !== 'agent.status' && e.name !== 'message.assistant') return
```

Ignores nothing critical among `delta.*`, but UI-only consumers that never mount widgets still miss report **content** embedded only in presentation/widget payloads if text/`content` is empty (`presentationCarrier` messages).

### 2.4 `delta.message_done` status filter — **medium**

Only accepts `completed|complete|done`. If the gateway sends another success spelling, the bubble never marks `done` (idle may still fire from a sibling message).

### 2.5 Session filter — **medium**

`mine(payload)` requires `session_id` match (or `chat_context.device_id === nodeId` before session known). Mis-bound session → silent drop of the final events.

### 2.6 History rehydrate gaps — **medium–high**

`historyAssistants` keeps rows whose `event_name`/role matches `/assistant/`. It can miss:

- presentation-carrier assistants with empty `content` but rich widgets;
- report text only in `display_text` / transcript segments if parsers disagree;
- messages beyond `limit: 20` on a hot thread.

Official UI rehydrates with `chat.history` / `chat.history_window` and merges **all** `chat_events`, including widgets (`eR.cH` / `vQ`).

### 2.7 Premature `chat/stop_stream` mirroring — **low–medium** for BotHub

Official clears expecting-response when `agent.status` leaves the busy set **and** there is already a non-empty assistant message. That is correct for their live subscription (they keep listening). Copying “stop = unsubscribe” into BotHub would reproduce this bug.

---

## 3. Fix recommendations (BotHub)

1. **Do not end the turn on first `message_done`.**  
   End only when:
   - `agent.status.activity_code` is non-busy (and ideally `online`/`idle`) **after** ≥1 completed assistant message, with a short debounce (1–2s), **or**
   - explicit user cancel / `chat.cancel`, **or**
   - hard timeout (keep ~5–10 min for long jobs).

2. **Accept new `message_id`s after the first bubble.**  
   On `delta.message_start` / `message.assistant` for a new id while the turn is open → create a **new** transcript row (multi-bubble). Never require `texts.has(id)` before handling `message_done`.

3. **Keep `chat.subscribe` for the account lifetime** (not per send). UI appends bubbles from the channel; `streamChat()` should be a wait-helper, not the sole owner of the subscription.

4. **After settle or reconnect, history reconcile:**
   ```ts
   chat.history({ session_id, limit: 50 }) // or history_window around newest_seq
   ```
   Upsert every assistant / presentation-carrier event newer than the last user message. Merge by `message_id`.

5. **Parse final text broadly:** `payload.content`, `display_text`, `transcriptText(payload)`, and widget fallbacks (`option` options join, `text_with_button.text`, markdown widgets). Show widget chips per `ONBOARDING.md`.

6. **Logging (redacted):** count `event_name`s per turn; if `agent.status` busy codes continue after UI marked done, flag “early settle”.

7. **E2E:** prompt that forces tools + a late summary; assert ≥2 assistant bubbles; kill WS mid-wait and assert history backfill restores the report.

---

## 4. Quick checklist

| Check | Expect |
|---|---|
| `chat.subscribe` still open during long work | yes |
| Second `delta.message_start` after first done | new bubble |
| `agent.status` text updating | sidebar/header (see `ACTIVITY.md`) |
| Final `message.assistant` / `message_done` | upsert by id |
| Post-turn `chat.history` | contains report if UI missed stream |

