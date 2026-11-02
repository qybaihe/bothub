# BotHub

A desktop hub for chat bots, where each **bot** is the unit you work with. A bot pairs a platform with one or more accounts. The UI is built with Electron, Vite, React, TypeScript and Tailwind CSS v4. Data is mocked for now; real platform protocols come later.

## Quick start

```bash
npm install        # also downloads the Electron binary (postinstall)
npm run dev        # Electron app with hot reload
npm run dev:web    # renderer only, in your browser at http://localhost:5174
```

| Script              | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Start Electron + Vite dev server (electron-vite)               |
| `npm run dev:web`   | Run just the renderer in a browser (no Electron, no preload)   |
| `npm run typecheck` | Type-check main/preload (`tsconfig.node.json`) and renderer (`tsconfig.web.json`) |
| `npm run build`     | Type-check, then build main, preload and renderer into `out/`  |
| `npm run start`     | Preview the production build in Electron                       |
| `npm run build:web` | Build the browser-only renderer into `dist/web/`               |

> If `install-electron` was skipped (e.g. `--ignore-scripts`), run `npx install-electron`.

## Layout

```
src/
  adapters/                 Platform layer (no DOM/Node/Electron imports)
    types.ts                PlatformAdapter interface + message/status types
    platforms.ts            Platform catalog (Meta Muse + "coming soon")
    registry.ts             AdapterRegistry: one adapter per platform
    meta-muse/mock.ts       Mock Meta Muse adapter: sessions, typing, delayed replies
  shared/                   Code shared by main, preload and renderer
    ipc.ts                  IPC channel names + payload types
    bridge.ts               Shape of window.electron
  main/
    index.ts                App window (hidden-inset title bar on macOS)
    webContentsViewManager.ts  WebContentsView per bot + account
    webViewIpc.ts           Validated IPC handlers for the view manager
  preload/index.ts          Exposes window.electron via contextBridge (sandboxed)
  renderer/src/
    store/botStore.ts       Zustand store: bots, accounts, groups, messages
    services/adapterBridge.ts  Adapter events → store
    components/             sidebar/, chat/, info/, add-bot/, ui/, layout/
```

## How it fits together

- **Bots and accounts.** A bot has `accountIds` and an `activeAccountId`. Accounts are stored once (normalized), so a session can back several bots. A bot's status is the status of its active account (online, busy, offline or error).
- **Adapters.** The UI talks to platforms only through `PlatformAdapter`: `listAccounts`, `connect`, `disconnect`, `sendMessage`, `subscribe`/`onMessage`, and `getStatus`. Store actions look up the adapter in the registry. `adapterBridge` sends message, typing and status events into the store.
  - To add a platform: add its id to `PlatformId` and `PLATFORMS`, implement the interface, and register it in `registerBuiltInAdapters()`.
- **Embedded web sessions.** `WebContentsViewManager` (main process) creates one sandboxed `WebContentsView` per bot + account. Each account gets its own persistent `persist:` partition, so logins stay isolated.
  - The renderer drives it through `window.electron.webViews` (`create` / `attach` / `resize` / `detach` / `destroy`).
  - It is hidden by default. The globe button in the chat header shows it over the conversation area.
  - Menus and dialogs hide the native view temporarily so they are never covered.
  - For now it loads a placeholder page.
- **Browser mode.** `window.electron` is optional and every access goes through `getBridge()`, so `dev:web` runs without Electron. Desktop-only features show a short explanation instead.

## Status

UI and mock data only. Nothing is saved: bots, messages, memory and notes live in memory and reset on reload.


## Meta Muse (muse.ai)

BotHub embeds https://muse.ai in an Electron WebContentsView (one persist partition per account) and calls the page gateway sendRequest when the hook finds it. If the hook only reaches DOM mode, chat falls back to typing into the page composer.

### Exercise the Muse flow

1. `npm run dev` (Electron — required for real Muse; `dev:web` has no WebContentsView).
2. Click Add bot → Meta Muse → add an account (name + email) → create.
3. Select the bot, click the globe to open the web session, sign in at muse.ai (email OTP is fine).
4. Back in the conversation, send `hi`. Status should move Idle → Running → Idle.
5. Open Details: refresh Sentinel approvals / Connectors. For a GitHub confirmation card, click Deny.
6. Add a second account, switch in the header — each keeps its own partition/session.

Mock mode: `BOTHUB_USE_MOCK_MUSE=1 npm run dev`.

Protocol notes: `docs/museai/protocol.md`.
