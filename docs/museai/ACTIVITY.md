# Muse live agent activity / status phrase

**Goal:** show a short “what Muse is doing now” line on BotHub (sidebar bot row + chat header) so a long-running turn does not look idle.

**Sources:** muse.ai JS (`js/1p-4zwr-bo7um.js`, `js/2fyj1z6br3l32.js`, `js/21rnprfgq7_go.js`, `js/27wd-rri0o3qg.js`, `js/0ja3zn5uqpyi9.js`, `js/139ad6to7j8dj.js`), `samples/gateway_methods.json`, native notes in `/workspace/mn/src/main/muse-native/chat.ts`.  
**Live wire samples:** none captured this turn (Noise encrypts). Field names = frontend reducer. **Confidence: high** for event/field names; **medium** for exact idle/`online` terminal codes beyond the busy set below.

---

## 1. Transport

| Piece | Detail | Confidence |
|---|---|---|
| Delivery channel | Same long-lived **`chat.subscribe`** NDJSON subscription that carries `delta.*` / `message.*` | **high** (handler registered next to `message.assistant` in `1p-4zwr-bo7um.js`; native `chat.ts` also receives `agent.status` on that channel) |
| Related subscription | **`activity.subscribe`** `POST /activity/subscribe` (`noiseOnly`, `streamMode:"subscription"`) — used for Activity **log** panel (`activity.updated` → refetch `activity.list`), **not** the avatar status phrase | **high** |
| Snapshot RPCs | `activity.list` `GET /activity`, `activity.get` `GET /activity/{id}` | **high** (catalog) |

`chat.stream` itself only ACKs the send; status and deltas arrive on **`chat.subscribe`**.

Envelope (same as other chat events; live native client also accepts `event` as alias of `event_name`):

```json
{
  "type": "event",
  "event_name": "agent.status",
  "seq": 123,
  "ts_ms": 1730000000000,
  "payload": { }
}
```

Native client flattens to `{ name, seq, payload }` where `payload` is the object below (or the whole event if fields are top-level — tolerate both).

---

## 2. Event: `agent.status` (primary)

**Wire fields** (snake_case on the event / payload):

| Field | Type | Meaning |
|---|---|---|
| `activity_code` | string | Machine status key (see §3) |
| `activity_text` | string | **Human phrase** shown under the avatar / in the status chip (“Reading docs…”, etc.) |
| `activity_emoji` | string \| null | Optional leading emoji |
| `agent_id` | string \| null | Root / companion agent id; UI keys per-root map |
| `count` | number \| null | Active **subagent** count (`agentSubagentCount`) |
| `cta` | object \| null | Optional call-to-action; UI only keeps it when `activity_code === "out_of_credits"` |

**CTA shape** (after client parse): `{ command: string, label: string }` (compare by `command`+`label`).

**Client store mapping** (`tA` in `1p-4zwr-bo7um.js`):

```ts
{
  agentActivityCode: activity_code,
  agentActivityText: activity_text,
  agentActivityEmoji: activity_emoji ?? null,
  agentActivityCta: activity_code === "out_of_credits" ? cta : null,
  agentSubagentCount: count ?? 0,
  agentActivityRootAgentId: agent_id,
  // also: agentActivitiesByRootAgentId[agent_id] = same slice
}
```

**Confidence: high.**

### 2.1 Also on the same subscription

| `event_name` | Role | Confidence |
|---|---|---|
| `task.status` | Live task chips / approvals (`task_id`, `status`, `agent_id`, scope) — not the one-line phrase | **high** |
| `activity.updated` | On **`activity.subscribe`**: invalidate Activity feed | **high** |

---

## 3. `activity_code` vocabulary

**Busy / “still working” set** (official UI treats these as in-flight; leaving this set can clear expecting-stream):

```text
responding | composing | making_something | working
| waiting_for_subagents | compacting
```

(`tC` / `tT` in `1p-4zwr-bo7um.js` — **high**)

**Other codes seen in the same bundle** (not all proven on `agent.status` wire):

```text
needs_approval | out_of_credits | guided_onboarding
| idle | preparing | fetching | connecting | shopping
| streaming | pending | cancelled | failed | …
```

Native settle heuristic also watches `activity_code === "online"` after all assistant messages complete (**medium** — observed in BotHub native `chat.ts`, not in the busy Set above).

**UI rule of thumb:**

- Show `activity_emoji` + `activity_text` whenever `activity_text` is non-empty.
- Treat membership in the busy set **or** `needs_approval` as “not idle” even if text is briefly empty.
- Clear the phrase when code leaves the busy set **and** text/emoji are null (official clears per-root via `tE` when code was busy).

---

## 4. How muse.ai renders it

Status chip under avatar / sidebar bubble (`27wd-rri0o3qg.js` / `0osmq1-xopdhu.js`):

- Prefers live override `{ state, activityText, activityEmoji }` when present.
- Else falls back to store `agentActivityText` / `agentActivityEmoji`.
- Classes: `text-body-status`, truncate with `title` = full phrase; optional CTA button for credits.
- Variants: `"inline"` (header) and `"panel"` (sidebar speech bubble / `status-sidebar-bubble`).

---

## 5. BotHub UI advice

### Sidebar bot row
- Under bot name: one truncated line  
  `` `${activityEmoji ? activityEmoji + " " : ""}${activityText}` ``  
  or muted “Working…” if busy-code without text.
- Dot color: green = connected+idle; amber/pulse = busy set / streaming; red = error; badge if `needs_approval`.

### Chat header
- Same phrase next to Muse title while the selected account’s `currentChatRootAgentId` matches the event’s `agent_id` (or `agent_id` is null).
- Subagent: append ` · ${count} subagents` when `count > 0`.
- On `out_of_credits`, show CTA label as a button (open upgrade URL already used by quota panel).

### Plumbing
1. Keep **one** `chat.subscribe` for the account (already required for streaming).
2. Handle `agent.status` → update account-scoped activity slice; do **not** require `activity.subscribe` for the phrase.
3. On reconnect: optional `activity.list` is for the Activity log only; status phrase will refresh on the next `agent.status`.
4. Do not stop listening when the first `delta.message_done` arrives — long jobs keep emitting new codes/text until idle/`online`.

### Redaction
Never log raw `auth_token`, cookies, or invite codes. Status text is user-visible; still scrub emails/URLs in samples.

---

## 6. Minimal TypeScript sketch

```ts
type AgentStatusPayload = {
  activity_code: string
  activity_text?: string
  activity_emoji?: string | null
  agent_id?: string | null
  count?: number | null
  cta?: { command?: string; label?: string } | null
}

const BUSY = new Set([
  'responding', 'composing', 'making_something', 'working',
  'waiting_for_subagents', 'compacting'
])

function applyAgentStatus(p: AgentStatusPayload) {
  return {
    code: p.activity_code,
    text: p.activity_text ?? null,
    emoji: p.activity_emoji ?? null,
    agentId: p.agent_id ?? null,
    subagents: p.count ?? 0,
    busy: BUSY.has(p.activity_code) || p.activity_code === 'needs_approval',
    cta: p.activity_code === 'out_of_credits' ? p.cta ?? null : null
  }
}
```

---

## 7. Related docs

- Final multi-bubble / “report” drop: `FINAL_REPORT.md`
- Onboarding name chips (Kai / Juno): `ONBOARDING.md`
- Stream basics: `protocol.md` §4, `samples/stream/README.md`
