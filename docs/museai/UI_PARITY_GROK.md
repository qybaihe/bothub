# Muse × Grok Bot UI parity

> Goal: make BotHub's Muse experience feel nearly pixel/UX-aligned with the official
> **Grok Bot** desktop app (Electron `sand` / `com.anysphere.sand`), without inventing
> fake Grok-native data. Prefer look-and-feel + navigation structure first; wire Muse
> RPCs only where they honestly map.
>
> Studied build: **Grok Bot 0.78.4** at `/Applications/Grok Bot.app` (brew cask).
> Date: 2026-11-03 (Asia/Singapore). Screenshots: blocked (SSH cannot attach Aqua;
> packaged app ignores/strips `--remote-debugging-port`). Inventory from `app.asar`
> renderer bundles + i18n (`index.eager-common-*`, detail/library/computer/template chunks).

## 0. Install / study status

| Item | Status |
|---|---|
| Official install | ✅ `/Applications/Grok Bot.app` via Homebrew cask, v0.78.4 |
| Dedicated userData | Attempted `/tmp/grokbot-userdata` (app may still prefer default Application Support) |
| Launch under SSH | Process starts; **no GUI window** visible to System Events from SSH |
| Screencapture / CDP | ❌ no display for `screencapture`; CDP port not listening |
| asar extract | ✅ `/tmp/grokbot-study/asar` (~61M) |
| Surface notes | ✅ `/tmp/grokbot-study/inventory/surfaces.txt` |

**Do not CONT** the paused Hark Electron unless needed. Leave Grok Bot study process alone or quit after inventory.

---

## 1. Target surfaces (Grok Bot)

### 1.A Left sidebar
- Brand / search / **Create New Bot** (+)
- **Host sidebar sections**: `getHostSidebarSections` / `setHostSidebarSections` → `{ id, name, agentIds[] }`
- Collapsible **section headers** (`sectionHeader` / `groupName`; empty → "Unallocated")
- **Configure sections**, **New section**, **Compact sidebar**
- **Pinned** agents (`setHostPinnedAgents`) separate from section membership
- Bot rows with live activity; pending agent creation placeholder
- Shared / template bots: "Add it to your sidebar…"

### 1.B Center chat
- Conversation + composer (parity later; not first slices)

### 1.C Right detail panel
Hero (avatar / rename) + **chip/tab strip**. Observed product surfaces from bundles + copy:

| Tab / chip | Grok meaning | Key chunks / APIs |
|---|---|---|
| **Details** | Overview identity, settings | team-bot-details-*, "Details", "Edit details" |
| **Library** | Pages / docs / store files / pins | `listLibraryPages`, `listLibraryPins`, `chunk-bot-store-files-library-*`, `chunk-library-visual-viewer-*`, "Documents and Files", "Skills in your library…" |
| **Computer** | Bot's own cloud desktop + preview | `chunk-computer-screen-preview-*`, "Computer preview", update/rebuild/asleep copy, "Grok Bot has its own computer…" |
| **Members** | People on the bot / team | `chunk-member-chip-*`, "Members connect their own accounts" |
| **Skills** | Reusable skill catalog on the bot | "Add skill", team-setup-new-skill, "Skills teach this Bot…" |

### 1.D Create Bot
- **Bot templates** gallery: `SearchBotTemplates`, `BotTemplateDraftDialog`, `BotTemplateDetailsDialog`, template editor / share card
- Flows: **Create New Bot**, **From template**, **Create new Team Bot**
- Not a "pick a third-party platform" picker — templates/styles are first-class

---

## 2. Current Muse / BotHub map

| Grok surface | BotHub today | Files | Gap |
|---|---|---|---|
| Sidebar sections | `groups[]` + collapsible headers **only when >1 group** | `sidebar/Sidebar.tsx`, `BotList.tsx`, `botStore.ts` | No always-on section chrome; no "Configure sections" / reorder / pinned row; styling thinner than Grok |
| Bot row + activity | Present (activity from Muse Noise) | `BotListItem.tsx`, store `activity` | Visual density / badges still diverge |
| Right panel tabs | **Details \| Browser** only | `info/InfoPanel.tsx` | Missing Library / Computer / Members / Skills chips |
| Details / Overview | Accounts, Memory, Notes | InfoPanel + `MemoryEditor` | OK baseline; Muse quota/invite currently dumped under Browser |
| Library | Muse `FilesSection` (`fs.*`) buried under Browser | `muse/FilesSection.tsx` | Needs first-class Library tab; no pages/pins/visual viewer |
| Computer | None (Muse has no cloud VM) | — | Empty shell only; do **not** fake a desktop. Optional later: map embedded web session / local machine tag carefully |
| Members | Hatch invite + future Trusted Network (`peers.*`) | `InviteSection.tsx`, `GAPS.md` | Invite ≠ Members; peers not wired |
| Skills | Connectors / approvals / schedules are adjacent but not Skills | `ConnectorsSection`, `ApprovalsSection`, `SchedulesSection` | No skill catalog UI |
| Create Bot templates | Platform picker → sign-in → name | `add-bot/AddBotDialog.tsx` | No Grok-style template/style gallery; Muse/Grok/Hark are platforms, not templates |
| Chat chrome | Muse stream + widgets | `chat/*` | Later |

---

## 3. API / capability constraints

| Capability | Grok Bot native | Muse in BotHub | Rule |
|---|---|---|---|
| Cloud computer / screen preview | First-class | **No** equivalent RPC | Shell + honest empty copy only |
| Library pages / pins / visual docs | Host media APIs | Partial: `fs.*` file list | Map files → Library; no fake pages |
| Skills catalog | Host skills | No Muse skill store | Empty / "coming via connectors" — don't invent |
| Members / team | Host members + Teams | Invite link + `peers.*` (unwired) | Keep Invite under Overview until peers land |
| Sidebar section persistence | Host box sync | Local `groups` in botStore | Local-only OK for chrome parity |
| Bot templates / styles | Host template search | N/A | Muse create stays platform+login; optional **visual** template cards later as Muse presets, not Grok clones |
| Activity / busy | Agent status | Muse `agent.status` / chat.subscribe | Already shipping |

Never surface Grok-only host RPCs through Muse adapters. Never fabricate Computer screenshots or Library pages.

---

## 4. Ordered implementation slices (smallest valuable first)

1. **Right detail tab shell** — rename/remap to `Overview | Library | Computer`; move Muse Files → Library; Overview keeps identity + Muse ops that aren't Library/Computer; Computer = empty honest shell. *(this turn)*
2. **Sidebar section chrome** — always show section headers; denser Grok-like header row; optional "New section" affordance (local groups only).
3. **Library body** — richer Files list (path crumbs, icons) without claiming "pages/pins".
4. **Members chip (shell)** — Invite + placeholder for Trusted Network (`GAPS.md` peers).
5. **Skills / Connectors alignment** — visual grouping under a Skills-like section or fourth chip when content exists.
6. **Create Bot template-style gallery** — Muse/Grok/Hark as **styled cards** (not fake Grok templates); optional Muse "starter" presets if product defines them.
7. **Pinned bots + compact sidebar** — local UX only.
8. **Chat chrome polish** — header chips matching Grok density.
9. **Computer deep-link** — only if Muse ever exposes a real desktop/session surface; until then stay empty.

---

## 5. Slice 1 acceptance

- [x] Info panel tabs read **Overview / Library / Computer** (not Details / Browser)
- [x] Muse files render under **Library**; non-Muse shows empty Library line
- [x] **Computer** shows empty state explaining Muse has no Grok-style cloud computer (no fake preview image)
- [x] Overview still has Accounts / Memory / Notes + remaining Muse sections (quota, invite, sessions, schedules, approvals, connectors)
- [x] No new secrets; typecheck/build green; atomic commit; **no push** unless asked

## 6. Next slice recommendation

After Slice 1: **Sidebar section chrome** (always-on headers + Configure/New section local UX) — highest remaining visual gap for "分组 整个UI设计".
