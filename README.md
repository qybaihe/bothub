# BotHub

Desktop hub for multi-account AI bots. Each **bot** pairs a platform (Meta Muse today, more later) with one or more signed-in accounts. Built with Electron, Vite, React, TypeScript, and Tailwind CSS.

## Install

Download the latest macOS arm64 build from [Releases](https://github.com/qybaihe/bothub/releases).

> The first release is **not code-signed**. On macOS: right-click → Open, or run `xattr -cr /Applications/BotHub.app` after moving it to Applications. Auto-update can detect and download new versions; applying them in-place needs a signed build, so unsigned installs open the release page as a fallback.

## Features

- Muse.ai sessions with multi-account partitions
- Streaming chat, connector approvals, connection health watchdog
- Light UI styled after DeepSeek-Bot
- In-app update checks (startup + periodic + manual)

## Develop

```bash
npm install
npm run dev          # Electron + hot reload
npm run typecheck
npm run build        # compile to out/
npm run dist         # package mac arm64 dmg + zip into release/
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Electron app with Vite HMR |
| `npm run typecheck` | Main/preload + renderer |
| `npm run build` | Production compile into `out/` |
| `npm run dist` | electron-builder mac arm64 (dmg + zip) |

## Layout

```
src/
  main/          Electron main (windows, Muse sessions, updater)
  preload/       contextBridge API
  shared/        IPC + bridge types
  renderer/      React UI
  adapters/      Platform adapters (Muse, …)
```

## License

MIT
