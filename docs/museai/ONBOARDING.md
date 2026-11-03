# Muse onboarding welcome + clickable name chips (Kai / Juno)

**Goal:** new-account welcome (“嘿 Brian…你想叫我什么？”) with tappable options (Kai / Juno / custom) must appear in BotHub’s transcript and send a reply on tap.

**Sources:** `js/3prk5wftwnh26.js` (widget kinds + parsers), `js/219ussi2x3jcn.js` (option UI + click → send), `js/1p-4zwr-bo7um.js` (`delta.presentation` / widgets on messages, `widgets.state.set`), gateway catalog.  
**Confidence:** **high** for `kind:"option"` wire + click behavior; **medium** that the exact Kai/Juno copy is always this widget (could also be plain text + same widget); **medium** for dedicated `onboarding.*` HTTP helpers vs chat-driven naming.

---

## 1. How the welcome shows up on the wire

Not a separate “onboarding chat API” for the bubble. It arrives like any assistant turn on **`chat.subscribe`**:

- Text: `delta.message_start` / `delta.text_append` / `delta.message_done` or `message.assistant` with welcome `content` / `display_text`.
- Chips: **widgets** on that message and/or a **`delta.presentation`** event.

Widget marker in markdown (optional): `[[hatch_widget:<id>]]`.

### 1.1 Widget kind: `option` (name / quick-reply chips)

Catalog string: **`"option"`** (exported as `BD` / `ez` in minified bundles).

**Parsed client data:**

```ts
{
  kind: "option",
  widgetId: string,              // presentation / widget id
  // optional title / displayText on the presentation wrapper
  data: {
    options: string[],           // e.g. ["Kai", "Juno"] — unique non-empty strings
    buttonStyle: "dotted_lines" | "center_aligned_filled",  // default dotted_lines
    customInput?: { placeholder: string }  // enables “Something else…”
  },
  state?: {                      // from widgets.state.*
    version: number,
    data?: { selectedText?: string | null }
  }
}
```

**Wire / gateway JSON** (snake_case before parse):

```json
{
  "kind": "option",
  "widget_id": "<id>",
  "data": {
    "options": ["Kai", "Juno"],
    "button_style": "dotted_lines",
    "custom_input": { "placeholder": "…" }
  }
}
```

Parser: `ti(options)` trims/dedups; `custom_input.placeholder` → `customInput`; unknown `button_style` → `dotted_lines`. **Confidence: high.**

### 1.2 Related kinds (do not confuse)

| kind | Use |
|---|---|
| `text_with_button` | Markdown/text + action buttons (email setup, redeem, …) — `data.textWithButton` |
| `image_options` | Image grid picker |
| `voice_options` | Voice picker (`data.options[]` of voice objects) |
| `generic_list` | List rows; item type `send_message` with `data.text` |

Kai/Juno naming UI matches **`option`** + optional `customInput`.

### 1.3 `delta.presentation`

Creates/updates an assistant (often `presentationCarrier: true` if content empty) with `presentations[]` / `widgets[]`. BotHub must insert a bubble even when `content === ""` if widgets/presentations exist.

---

## 2. Click behavior (official)

From `219ussi2x3jcn.js` `t9`:

1. Ignore if already selected (`selectedText` in widget state or optimistic).
2. Optimistic UI select.
3. **Persist:** `onPersistState(hostMessageId, widgetId, { selectedText })`  
   → RPC **`widgets.state.set`**  
   `POST /widgets/state` (noiseOnly):

   ```ts
   {
     widget_id: string,
     base_version: number,          // from last server state
     mutation_id: string,           // uuid
     state: { selectedText: string } // exact shape passed through client (`ZU`)
   }
   ```

   Also catalogued: `widgets.state.patch` `POST /widgets/state/patch`.

4. **Send chat:** `onSendMessage(widgetId, selectedText, { messageOrigin: {…} })`  
   which becomes a normal **`chat.stream`** user message whose text is the option label (`"Kai"` / `"Juno"` / custom string), with client metadata:

   ```ts
   message_origin: {
     kind: "options_widget",
     widget_id: string,
     message_id: string,        // host assistant message id
     option_index: number,      // index in data.options (−1 if custom?)
     interaction_id: string     // uuid
   }
   ```

5. **Custom:** “Something else…” focuses composer with placeholder; user types a name; same send path with that text (and state `selectedText`).

Analytics event name: `CHAT_OPTION_SELECT` / `chat_option_select` (optional for BotHub).

**Confidence: high.**

---

## 3. Optional onboarding HTTP (account shell)

Gateway (not required to render chips):

| method | HTTP | path |
|---|---|---|
| `onboarding.state` | GET | `/onboarding` |
| `onboarding.questions` | GET | `/onboarding/questions` |
| `onboarding.identity` | GET | `/onboarding/identity` |
| `onboarding.identity.set` | POST | `/onboarding/identity` |
| `onboarding.complete` | POST | `/onboarding/complete` |
| `onboarding.reset` | POST | `/onboarding/reset` |
| `onboarding.tasks` | GET | `/onboarding/tasks` |
| `onboarding.pages.start` | POST | `/onboarding/pages` |
| `onboarding.variants` | GET | `/api/onboarding/variants` |

`activity_code: "guided_onboarding"` may appear on `agent.status` during this flow (**medium**). Prefer chat widgets for BotHub MVP; call `onboarding.identity.set` only if product needs parity with muse.ai settings.

---

## 4. BotHub UI adaptation

### Render
- When an assistant message has `widgets`/`presentations` with `kind === "option"`, show the welcome markdown/text **and** a row of chips from `data.options`.
- If `customInput` present, add a chip/button “自定义…” / localized “Something else…” opening an inline text field.
- Disable chips after `state.data.selectedText` or successful send; show check on the chosen chip.
- `buttonStyle === "center_aligned_filled"` → filled pills; else outline/dotted.

### Tap
1. Optimistic select.
2. `widgets.state.set` (best-effort; retry/rebase on version like official — or skip if set fails but still send).
3. `chat.stream` with `items: [{ type:"text", text: selected }]`, same `session_id` / `node_id` / capabilities as normal send; attach `message_origin` if the gateway accepts it (pass-through in client capabilities metadata — **medium**, safe to include).
4. Append the user bubble locally; wait for assistant continuation on `chat.subscribe`.

### History
- Rehydrate widgets from `chat.history` `chat_events` (`message.assistant` payload.widgets / presentation events).
- Selected state may already be in widget `state`; reflect read-only chips.

### Do not
- Strip `presentationCarrier` messages.
- Require non-empty `content` to show a bubble.
- End the turn before the post-name reply finishes (see `FINAL_REPORT.md`).

---

## 5. Example (redacted)

```json
{
  "type": "event",
  "event_name": "message.assistant",
  "message_id": "<assistant_msg>",
  "payload": {
    "content": "嘿 Brian…你想叫我什么？",
    "status": "complete",
    "widgets": [
      {
        "kind": "option",
        "widget_id": "<widget>",
        "data": {
          "options": ["Kai", "Juno"],
          "button_style": "dotted_lines",
          "custom_input": { "placeholder": "输入名字" }
        }
      }
    ]
  }
}
```

(Field nesting may be `data` vs flattened presentation — accept both; parsers in `3prk5wftwnh26.js` normalize.)

---

## 6. Related

- Live working phrase: `ACTIVITY.md` (`agent.status`)
- Multi-bubble final report: `FINAL_REPORT.md`
