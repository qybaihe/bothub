<div align="center">

**English** · [简体中文](docs/readme/README_zh.md) · [繁體中文](docs/readme/README_zh-TW.md) · [日本語](docs/readme/README_ja.md) · [한국어](docs/readme/README_ko.md) · [Español](docs/readme/README_es.md) · [Français](docs/readme/README_fr.md) · [Deutsch](docs/readme/README_de.md) · [Português (Brasil)](docs/readme/README_pt-BR.md) · [Русский](docs/readme/README_ru.md)

<br />

<img src="docs/assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Bring all your personal agents together and use them in one client, just like Grok Bot**

**A macOS and Windows app that puts your Meta Muse, Grok Bot, Hark and Dot bots in one window, each signed in with its own isolated account.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Release&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-quick-start)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-38bdf8?style=for-the-badge)](LICENSE)

**[⬇️ Download for macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Download for Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 All releases](https://github.com/qybaihe/bothub/releases) · [🐛 Report an issue](https://github.com/qybaihe/bothub/issues)**

[Quick Start](#-quick-start) · [Platforms](#-supported-platforms) · [Features](#-features) · [Development](#-development) · [Releasing](#-releasing) · [Protocol Docs](#-protocol-docs) · [FAQ](#-faq)

</div>

---

> [!NOTE]
> BotHub is an independent client. It is not affiliated with Meta, xAI, Hark or OpenAI. You sign in with your own accounts, and credentials stay on your computer.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bothub-dark.webp">
  <img src="docs/assets/bothub-light.webp" alt="BotHub: Muse, Dot, Hark and Grok Bot bots grouped in the sidebar, a conversation and the bot inspector (sample data)" width="100%">
</picture>
<sub>Screenshot with fictional sample data.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Every agent, one window
Muse, Grok Bot, Hark and Dot bots side by side, grouped in the sidebar, each with its own chat, inspector and settings.

</td>
<td width="33%" valign="top">

### 🔐 Isolated accounts
Every account runs in its own session partition or encrypted credential slot, so several accounts on the same platform never mix.

</td>
<td width="33%" valign="top">

### ✅ Reliable delivery
Messages show *sending*, *delivered · replying*, *no reply* or *failed*. A message the platform accepted is never offered as unsent, so a retry never posts it twice.

</td>
</tr>
</table>

---

## ⚡ Quick Start

Download the file for your system from the [latest release](https://github.com/qybaihe/bothub/releases/latest):

| System | File |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<version>-arm64.dmg` |
| macOS, Intel | `BotHub-<version>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<version>-x64.exe` |

> [!TIP]
> Builds are not code-signed yet.
> - **macOS**: drag `BotHub.app` into Applications, then right-click it and choose **Open** the first time (or *System Settings → Privacy & Security → Open Anyway*). You can also clear the quarantine flag with `xattr -cr /Applications/BotHub.app`.
> - **Windows**: if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.

Then click **+** in the sidebar, pick a platform, and sign in. Each bot keeps its own account.

**Updates**: on Windows, BotHub downloads new versions in the background and installs them with one click. On macOS, it tells you when a new version is out and opens the download page.

## 🤖 Supported Platforms

| Platform | Protocol & transport | What you get |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Isolated Electron partition + native WebSocket gateway | Multiple accounts, batch import with email codes, per-account HTTP/SOCKS5 proxy, cloud computer, goals, peers, workspace files, connector approvals and diagnostics |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf over the Sand gateway (`*.sand.x.ai`) | Multiple accounts, Sand cloud workspace, live streaming, tool-call traces, sessions, scheduled tasks, memories and skills |
| **Hark** (`hark.com`) | WebSocket RPC + multimodal REST | Browser sign-in (Google or email), live streaming with background reply sync, file and image attachments, document cards, scheduled tasks, memories and connectors |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + server-sent events | Browser OAuth sign-in or Access/Refresh Token import, encrypted token storage, live streaming, file uploads, skills, automations, connectors and per-account proxy |

## ✨ Features

- **Many accounts, no cross-talk**: each account lives in its own Electron `persist:` partition or encrypted credential slot, so you can run several accounts of the same platform at once.
- **Management console**: a full-screen view with a fleet overview, bot filtering and search, batch connection checks, and per-platform accounts, tokens and proxies.
- **Rich agent chat**: live streaming with thinking traces and tool cards, recovery for long background tasks, Markdown tables, highlighted code, document previews, and attachment downloads.
- **Bot inspector**: the right-hand panel shows each bot's sessions, scheduled tasks, memories, skills, files and members, depending on the platform.
- **Living avatars**: every bot gets an animated `GrokBotMark` character that follows your pointer and reacts while it works; pick a shape and color or upload a photo.
- **Secure by default**: tokens and proxy passwords are encrypted with Electron `safeStorage` (Keychain on macOS) and written with `0600` permissions. No hard-coded secrets, no telemetry.
- **English and Chinese UI**, light and dark themes.

## 🧰 Development

```bash
npm ci
npm run dev          # Electron + Vite with hot reload
```

| Command | Description |
| :--- | :--- |
| `npm run dev` | Run the Electron main process, preload and React renderer with hot reload |
| `npm run dev:web` | Run only the renderer in a browser (no Electron, no accounts) |
| `npm run typecheck` | Type-check the Node and web targets |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check and build production bundles into `out/` |
| `npm run dist:mac` / `npm run dist:win` | Package macOS `dmg` + `zip` (arm64 + x64) / the Windows NSIS installer into `release/` |
| `npm run dist:dir` | Unpacked macOS arm64 app for a quick smoke test |

The README screenshot is generated from fictional data: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Releasing

CI ([`ci.yml`](.github/workflows/ci.yml)) type-checks, tests, builds and packages on macOS and Windows for every push.

1. Bump `version` in `package.json` and merge to `main`.
2. Push a tag `vX.Y.Z` that matches the version.
3. [`release.yml`](.github/workflows/release.yml) creates a draft release, builds macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) and Windows (NSIS `exe`, `latest.yml`), uploads everything, and publishes the release once every file is there.

Builds are unsigned by default. Signing and notarization turn on when these repository secrets are set: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) or `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Project Structure

```text
src/
  adapters/        Platform adapters (Meta Muse, Grok Bot, Hark, Dot) and the shared PlatformAdapter interface
  main/            Electron main process
    muse/          Muse partition sessions, batch sign-in and per-account proxy routing
    muse-native/   Native WebSocket gateway client for Muse cloud computer and workspace calls
    grok/          Grok Bot Sand auth, Connect-RPC client and IPC handlers
    hark/          Hark WebSocket/REST client, attachment uploader and IPC handlers
    dot/           OpenAI Dot (Orbit/TBO) client, encrypted token vault, SSE streaming and IPC
  preload/         Typed contextBridge API exposed as window.electron
  shared/          IPC channel contracts and bridge types shared by main and renderer
  renderer/        React + Tailwind + Zustand desktop UI
    components/    Sidebar, chat, inspector, platform panels, management console, GrokBotMark
    store/         Bot fleet state, streaming reconciler and persistence
scripts/screenshot/  README screenshot from fictional sample data
```

## 📚 Protocol Docs

Wire protocols and API notes for each platform live in [`docs/`](docs/README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](docs/dot/protocol.md): OAuth PKCE and web session auth, Orbit profiles, room SSE and REST, the JSON-RPC 2.0 WebSocket, Pages, Library and memory migration
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](docs/museai/protocol.md): the `Noise_XX_25519_ChaChaPoly_SHA256` WebSocket handshake and 65+ JSON-RPC methods
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](docs/grokbot-protocol/protocol.md): Connect-RPC unary and streaming calls over HTTP/2, Sand auth, skills, memories, automations and the cloud sandbox
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](docs/hark/protocol.md): REST and NDJSON streaming endpoints, connectors, scheduled tasks, the VM file tree and computer sessions

## ❓ FAQ

<details>
<summary><b>Is BotHub an official app from these platforms?</b></summary>

No. BotHub is an independent client and is not affiliated with Meta, xAI, Hark or OpenAI. It uses your own accounts on each platform.

</details>

<details>
<summary><b>Where are my accounts and tokens stored?</b></summary>

Only on your computer. Web sessions live in per-account Electron partitions; tokens and proxy passwords are encrypted with `safeStorage` (Keychain on macOS) and saved with `0600` permissions. BotHub sends no telemetry.

</details>

<details>
<summary><b>macOS says BotHub can't be opened. What do I do?</b></summary>

The builds are not signed yet. Right-click the app and choose **Open**, or run `xattr -cr /Applications/BotHub.app`. See [Quick Start](#-quick-start).

</details>

<details>
<summary><b>A message says "delivered · replying" for a long time. Will retrying send it twice?</b></summary>

No. Once the platform has accepted a message, BotHub never offers it as unsent. If no reply arrives, it shows *no reply* with a **Send again** button that clearly posts a second copy.

</details>

<details>
<summary><b>Can each account use its own proxy?</b></summary>

Yes, for Muse and Dot accounts (HTTP or SOCKS5). If the proxy can't be applied, BotHub blocks that account's traffic instead of falling back to a direct connection.

</details>

## 📄 License

Released under the [MIT License](LICENSE).
