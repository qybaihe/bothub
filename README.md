<div align="center">

# BotHub

**Unified Multi-Account Desktop Workspace for Personal AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: macOS arm64](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon)-111318.svg)](https://github.com/qybaihe/bothub/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)

**English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

</div>

---

## Overview

**BotHub** is a native macOS desktop hub built with Electron, React, TypeScript, and Tailwind CSS that unifies multiple personal AI agent platforms into a single workspace. Each **Bot** pairs a supported agent platform with an isolated account session (`partition`), allowing you to run, inspect, and orchestrate dozens of personal AI agents side by side without browser tab sprawl or session collisions.

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

## Installation

Download the latest macOS (`arm64`) build from [GitHub Releases](https://github.com/qybaihe/bothub/releases).

> **Note for unsigned macOS builds**: After dragging `BotHub.app` into `/Applications`, right-click → **Open**, or clear the quarantine attribute in Terminal:
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

## Development

```bash
npm install
npm run dev          # Start Electron with Vite HMR
npm run typecheck    # Run TypeScript checks across main, preload, and renderer
npm run build        # Compile production bundles into out/
npm run dist         # Package macOS arm64 dmg + zip into release/
```

| Command | Description |
| :--- | :--- |
| `npm run dev` | Launch Electron main, preload, and React renderer with hot reload |
| `npm run typecheck` | Type-check Node (`tsconfig.node.json`) and Web (`tsconfig.web.json`) targets |
| `npm run build` | Build production bundles into `out/` |
| `npm run dist` | Package distributable macOS `dmg` and `zip` artifacts via `electron-builder` |

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
