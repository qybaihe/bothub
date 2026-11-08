# BotHub

<p align="center">
  <strong>Unified Multi-Account Desktop Workspace for Personal AI Agents</strong><br/>
  <strong>面向多平台、多账号的桌面端个人 AI 智能体中枢</strong>
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#简体中文">简体中文</a> · <a href="./README.zh-CN.md">独立中文文档 (README.zh-CN.md)</a> · <a href="https://github.com/qybaihe/bothub/releases">Releases</a>
</p>

---

<a id="english"></a>

## BotHub — English

**BotHub** is a native macOS desktop hub built with Electron, React, TypeScript, and Tailwind CSS that unifies multiple personal AI agent platforms into a single workspace. Each **Bot** pairs a supported agent platform with an isolated account session (`partition`), allowing you to run, inspect, and orchestrate dozens of personal AI agents side by side without browser tab sprawl or session collisions.

### Supported Platforms

| Platform | Protocol & Transport | Core Capabilities |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Isolated Electron Partition + Native WebSocket Gateway | Multi-account session isolation, batch account import, per-account HTTP/SOCKS5 proxy, cloud computer control, goals, peers, workspace files, connector approvals, and agent diagnostics |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf over Sand Gateway (`*.sand.x.ai`) | Multi-account sign-in, Sand cloud workspace, real-time streaming, tool call trace inspection, and interactive `GrokBotMark` procedural character avatars |
| **Hark** (`hark.com`) | WebSocket RPC + Multimodal REST API | Google/Email sign-in, real-time streaming + background reply sync, multimodal file & image attachments, native document cards, scheduled tasks, user memories, and third-party connectors |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + Server-Sent Events (SSE) | Browser OAuth sign-in, Access Token (`AT`) / Refresh Token (`RT`) import, hardware-backed credential encryption (`safeStorage`), real-time SSE streaming, file uploads, skills, automations, and connectors |

### Key Highlights

- **Strict Multi-Account Isolation**: Every account runs inside its own Electron `persist:` session partition or encrypted credential slot. Sign in to multiple accounts on the same platform simultaneously without cookie bleed.
- **Unified Management Console**: Full-screen management view (`SettingsView`) offering a global fleet overview, multi-dimensional Bot filtering/search, batch connectivity checks, and dedicated per-platform account/token/proxy management.
- **Rich Agent Chat & Artifact Experience**:
  - Real-time streaming with thinking traces, tool execution cards, and watchdog recovery for long-running background tasks.
  - Native Document preview modal (`NativeDocumentDialog`), Markdown tables, syntax-highlighted code blocks, and one-click file/image attachment downloads.
- **Interactive Procedural Bot Avatars**: Powered by the custom `GrokBotMark` motion engine, bots feature expressive, customizable procedural SVG avatars with pointer tracking, working/thinking animations, and custom photo overrides.
- **Security by Default**:
  - Sensitive tokens (such as Dot Access/Refresh Tokens and per-account proxy credentials) are encrypted at rest via macOS Keychain / Electron `safeStorage` with `0600` file permissions.
  - Zero hardcoded secrets or external telemetry.

### Installation

Download the latest macOS (`arm64`) build from [GitHub Releases](https://github.com/qybaihe/bothub/releases).

> **Note for unsigned macOS builds**: After dragging `BotHub.app` into `/Applications`, right-click → **Open**, or clear the quarantine attribute in Terminal:
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

### Development

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

### Architecture

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

---

<a id="简体中文"></a>

## BotHub — 简体中文

**BotHub** 是一款基于 Electron、React、TypeScript 与 Tailwind CSS 构建的 macOS 原生桌面端 AI 智能体工作台。它将多个个人 AI Agent 平台（**Meta Muse**、**Grok Bot**、**Hark**、**Dot**）聚合在统一的原生界面中；每个 **Bot** 绑定独立隔离的账号会话（`partition`），支持同平台多账号并行在线、实时流式对话、云端电脑/工具调用检视以及集中式管理中心。

### 已接入平台一览

| 平台 | 协议与传输层 | 核心能力支持 |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | 独立 Electron Partition + 原生 WebSocket 网关 | 多账号隔离登录、邮箱验证码批量导入、单账号独立 HTTP/SOCKS5 代理、云端电脑（Computer）状态检视、目标（Goals）、协作节点（Peers）、工作区文件、连接器审批与诊断 |
| **Grok Bot** (`grok.com`) | Sand 网关 (`*.sand.x.ai`) Connect-RPC / Protobuf | 多账号隔离登录、Sand 云端工作区同步、实时流式输出、工具调用轨迹展示、以及可交互的 `GrokBotMark` 动态几何角色头像引擎 |
| **Hark** (`hark.com`) | WebSocket RPC + 多模态 REST 接口 | 浏览器登录与会话恢复、流式对话与后台异步回复轮询、图片/文件多模态上传与下载、原生文档卡片预览、定时任务、用户记忆（Memories）与连接器管理 |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + SSE 实时流 | 支持浏览器 OAuth 登录及 ChatGPT Access Token (`AT`) / Refresh Token (`RT`) 直接导入、基于系统钥匙串 `safeStorage` 的凭据加密存储、SSE 实时流式生成、文件上传、技能（Skills）、定时任务与连接器管理 |

### 核心特性

- **原生级多账号会话隔离**：每个账号运行在独立的 Electron `persist:` 分区或加密凭据槽位中，同一平台可同时挂载多个账号与多个 Bot，互不串号。
- **全功能管理中心（Management Console）**：内置全屏管理视图（`SettingsView`），提供全局概览大盘、按平台/状态/关键字筛选的 Bot 列表、一键批量连通性检测，以及针对四大平台的专属账号、Token 与代理管理面板。
- **深度适配的 Agent 聊天与产物体验**：
  - 完整呈现思考过程（Thinking Trace）、工具执行卡片（Tool Invocations）、长耗时任务后台防断流恢复（Watchdog & Background Polling）。
  - 支持原生文档弹窗预览（`NativeDocumentDialog`）、Markdown 表格与代码高亮、多模态附件上传与本地保存。
- **动态几何角色头像（`GrokBotMark`）**：所有 Bot 默认配备可随鼠标视线互动、思考状态律动的 `GrokBotMark` 动态几何角色头像，同时支持随时切换形状/配色或上传自定义头像图片。
- **凭据安全与隐私保护**：
  - 本地持久化的敏感凭据（如 Dot 的 `AT`/`RT` 及账号代理密码）默认通过 Electron `safeStorage`（macOS Keychain）加密并以 `0600` 权限落盘。
  - 代码库零硬编码密钥、无任何第三方隐私遥测。

### 安装说明

前往 [GitHub Releases](https://github.com/qybaihe/bothub/releases) 下载最新 macOS (`arm64`) 安装包。

> **macOS 未签名包打开提示**：将 `BotHub.app` 拖入 `/Applications` 后，首次打开请右键点击选「打开」，或在终端执行以下命令移除隔离属性：
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

### 本地开发与构建

```bash
npm install
npm run dev          # 启动 Electron + Vite 热更新开发环境
npm run typecheck    # 运行主进程、预加载脚本与渲染进程 TypeScript 类型检查
npm run build        # 编译生产构建产物至 out/
npm run dist         # 使用 electron-builder 打包 macOS arm64 dmg 与 zip
```

### 目录结构

```text
src/
  adapters/        四大平台适配器（Meta Muse、Grok Bot、Hark、Dot）与统一 PlatformAdapter 接口
  main/            Electron 主进程
    muse/          Muse 分区会话管理、批量自动登录、单账号代理路由与测速
    muse-native/   Muse 原生 WebSocket 网关客户端（云端电脑、工作区文件、工具审批等）
    grok/          Grok Bot Sand 鉴权、Connect-RPC 客户端与 IPC 通道
    hark/          Hark WebSocket/REST 客户端、多模态附件上传与 IPC 通道
    dot/           OpenAI Dot (Orbit/TBO) 客户端、safeStorage 加密凭据库、SSE 流与 IPC 通道
  preload/         通过 contextBridge 暴露给渲染进程的类型安全 API (window.bothub)
  shared/          主进程与渲染进程共享的 IPC 协议与类型定义
  renderer/        React + Tailwind CSS + Zustand 渲染层界面
    components/    侧边栏、聊天区、右侧平台检视面板、全屏管理中心、GrokBotMark 角色引擎
    store/         Zustand 全局 Bot 状态管理、流式消息聚合与本地持久化
```

## License

[MIT](./LICENSE)
