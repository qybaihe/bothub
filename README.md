<div align="center">

# BotHub

**One desktop workspace for all your personal AI agents**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?label=Release&color=111318)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://github.com/qybaihe/bothub/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-6E56CF.svg)](https://github.com/qybaihe/bothub/releases/latest)

[![Download](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/qybaihe/bothub/releases/latest)
[![Download](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/qybaihe/bothub/releases/latest)

**English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bothub-dark.webp">
  <img src="docs/assets/bothub-light.webp" alt="BotHub: many Muse, Dot, Hark and Grok Bot bots in the sidebar and a conversation open (sample data)" width="100%">
</picture>

</div>

<p align="center"><sub>Screenshot with fictional sample data: bots on Muse, Dot, Hark and Grok Bot, grouped in the sidebar.</sub></p>

---

## Overview

**BotHub** is a desktop hub for macOS and Windows built with Electron, React, TypeScript, and Tailwind CSS that unifies multiple personal AI agent platforms into a single workspace. Each **Bot** pairs a supported agent platform with an isolated account session (`partition`), allowing you to run, inspect, and orchestrate dozens of personal AI agents side by side without browser tab sprawl or session collisions.

## Supported Platforms

| Platform | Protocol & Transport | Core Capabilities |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Isolated Electron Partition + Native WebSocket Gateway | Multi-account session isolation, batch account import, per-account HTTP/SOCKS5 proxy, cloud computer control, goals, peers, workspace files, connector approvals, and agent diagnostics |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf over Sand Gateway (`*.sand.x.ai`) | Multi-account sign-in, Sand cloud workspace, real-time streaming, tool call trace inspection, and interactive `GrokBotMark` procedural character avatars |
| **Hark** (`hark.com`) | WebSocket RPC + Multimodal REST API | Google/Email sign-in, real-time streaming + background reply sync, multimodal file & image attachments, native document cards, scheduled tasks, user memories, and third-party connectors |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + Server-Sent Events (SSE) | Browser OAuth sign-in, Access Token (`AT`) / Refresh Token (`RT`) import, hardware-backed credential encryption (`safeStorage`), real-time SSE streaming, file uploads, skills, automations, and connectors |

## Key Features

- **Strict Multi-Account Isolation**
  Every account runs inside its own Electron `persist:` session partition or encrypted credential slot. Sign in to multiple accounts on the same platform simultaneously without cookie bleed.
- **Unified Management Console**
  Full-screen management view (`SettingsView`) offering a global fleet overview, multi-dimensional Bot filtering and search, batch connectivity checks, and dedicated per-platform account, token, and proxy management.
- **Rich Agent Chat & Artifact Experience**
  - Real-time streaming with thinking traces, tool execution cards, and watchdog recovery for long-running background tasks.
  - Native Document preview modal (`NativeDocumentDialog`), Markdown tables, syntax-highlighted code blocks, and one-click file/image attachment downloads.
- **Interactive Procedural Bot Avatars (`GrokBotMark`)**
  Powered by the custom `GrokBotMark` motion engine, bots feature expressive, customizable procedural SVG avatars with pointer tracking, working/thinking animations, and custom photo overrides.
- **Security by Default**
  - Sensitive tokens (such as Dot Access/Refresh Tokens and per-account proxy credentials) are encrypted at rest via macOS Keychain / Electron `safeStorage` with `0600` file permissions.
  - Zero hardcoded secrets or external telemetry.
- **Reliable delivery**
  Messages show *sending*, *delivered · replying*, *no reply* or *failed*. A message the platform already accepted is never offered as "not sent", so retrying does not post it twice.

## Installation

Download from the [latest release](https://github.com/qybaihe/bothub/releases/latest):

| System | File |
| :--- | :--- |
| macOS, Apple Silicon | `BotHub-<version>-arm64.dmg` |
| macOS, Intel | `BotHub-<version>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<version>-x64.exe` |

> **macOS (unsigned build)**: drag `BotHub.app` into `/Applications`, then right-click → **Open** the first time (or *System Settings → Privacy & Security → Open Anyway*). Alternatively clear the quarantine flag:
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```
>
> **Windows (unsigned installer)**: if SmartScreen shows "Windows protected your PC", click **More info → Run anyway**.

Updates: on Windows BotHub downloads new versions from GitHub Releases in the background and installs them with one click; on macOS it tells you when a new version is out and opens the download page.

## Development

```bash
npm ci
npm run dev          # Electron + Vite with hot reload
```

| Command | Description |
| :--- | :--- |
| `npm run dev` | Run Electron main, preload and the React renderer with hot reload |
| `npm run dev:web` | Run only the renderer in a browser (no Electron, no accounts) |
| `npm run typecheck` | Type-check the Node and web targets |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check and build production bundles into `out/` |
| `npm run dist:mac` / `npm run dist:win` | Package macOS `dmg` + `zip` (arm64 + x64) / Windows NSIS installer into `release/` |
| `npm run dist:dir` | Unpacked macOS arm64 app for a quick smoke test |

The README screenshot is generated from fictional data with `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## Releasing

CI (`.github/workflows/ci.yml`) type-checks, tests, builds and packages on macOS and Windows for every push.

1. Bump `version` in `package.json` and merge to `main`.
2. Push a tag `vX.Y.Z` matching that version.
3. `release.yml` creates a draft release, builds macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) and Windows (NSIS `exe`, `latest.yml`), uploads everything, and publishes the release once all assets are present.

Builds are unsigned by default. Code signing and notarization turn on when the repository secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) or `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows) are set.

## Project Structure

```text
src/
  adapters/        Platform adapters (Meta Muse, Grok Bot, Hark, Dot) & unified PlatformAdapter interface
  main/            Electron main process
    muse/          Muse partition session manager, batch login, and per-account proxy routing
    muse-native/   Direct WebSocket gateway client for Muse cloud computer & workspace RPCs
    grok/          Grok Bot Sand authentication, Connect-RPC client, and IPC handlers
    hark/          Hark WebSocket/REST client, multimodal uploader, and IPC handlers
    dot/           OpenAI Dot (Orbit/TBO) client, safeStorage token vault, SSE streamer, and IPC
  preload/         Typed contextBridge API exposed as window.bothub
  shared/          Shared IPC channel contracts and bridge types
  renderer/        React + Tailwind + Zustand desktop UI
    components/    Sidebar, ChatArea, InfoPanel, platform inspectors, SettingsView, GrokBotMark
    store/         Zustand bot fleet state, streaming reconciler, and persistence
```

## Protocol & API Documentation

Detailed wire-protocol specifications and API references for each adapted agent platform live in [`docs/`](./docs/README.md):

- **OpenAI Dot (`chatgpt.com/dots`)**: [`docs/dot/protocol.md`](./docs/dot/protocol.md) — OAuth PKCE & web session auth, `/backend-api/tbo` Orbit profiles, `/backend-api/calpico/rooms` SSE & REST, `/backend-api/otp/ws` JSON-RPC 2.0 WebSocket, Dynamic Pages, Library, and cross-account memory migration
- **Meta Muse (`muse.ai`)**: [`docs/museai/protocol.md`](./docs/museai/protocol.md) — `Noise_XX_25519_ChaChaPoly_SHA256` encrypted WebSocket handshake and 65+ JSON-RPC methods
- **xAI Grok Bot (`grok.com`)**: [`docs/grokbot-protocol/protocol.md`](./docs/grokbot-protocol/protocol.md) — Connect-RPC unary & streaming RPCs over HTTP/2, Sand auth, skills, memories, automations, and cloud sandbox
- **Hark (`hark.com`)**: [`docs/hark/protocol.md`](./docs/hark/protocol.md) — REST + NDJSON streaming endpoints, connectors, scheduled tasks, VM file tree, and computer sessions

## License

Released under the [MIT License](./LICENSE).
