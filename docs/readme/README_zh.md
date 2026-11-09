<div align="center">

[English](../../README.md) · **简体中文** · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **集合你的各种 personal agent，在同一个客户端中像 Grok Bot 一样使用它们**

**一款 macOS / Windows 桌面应用，把 Meta Muse、Grok Bot、Hark 和 Dot 上的 Bot 放进同一个窗口，每个 Bot 都用各自隔离的账号登录。**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-快速开始)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ 下载 macOS 版](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ 下载 Windows 版](https://github.com/qybaihe/bothub/releases/latest) · [📦 全部版本](https://github.com/qybaihe/bothub/releases) · [🐛 反馈问题](https://github.com/qybaihe/bothub/issues)**

[快速开始](#-快速开始) · [支持的平台](#-支持的平台) · [功能特性](#-功能特性) · [本地开发](#-本地开发) · [发布流程](#-发布流程) · [协议文档](#-协议文档) · [常见问题](#-常见问题)

</div>

---

> [!NOTE]
> BotHub 是独立开发的客户端，与 Meta、xAI、Hark、OpenAI 均无关联。你使用自己的账号登录，凭据只保存在你自己的电脑上。

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub：侧边栏分组列出 Muse、Dot、Hark、Grok Bot 上的 Bot，中间是对话，右侧是 Bot 详情（示例数据）" width="100%">
</picture>
<sub>截图使用虚构的示例数据。</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 所有智能体，一个窗口
Muse、Grok Bot、Hark、Dot 的 Bot 并排在侧边栏里按分组排列，每个 Bot 都有自己的对话、详情面板和设置。

</td>
<td width="33%" valign="top">

### 🔐 账号相互隔离
每个账号运行在独立的会话分区或加密凭据槽位里，同一平台登录多个账号也不会串号。

</td>
<td width="33%" valign="top">

### ✅ 可靠投递
消息会显示「发送中」「已送达 · 回复中」「没有收到回复」或「发送失败」。平台已经收到的消息不会再被当成未发送，重试不会重复发出。

</td>
</tr>
</table>

---

## ⚡ 快速开始

从 [最新版本](https://github.com/qybaihe/bothub/releases/latest) 下载对应系统的文件：

| 系统 | 文件 |
| :--- | :--- |
| macOS（Apple 芯片） | `BotHub-<版本号>-arm64.dmg` |
| macOS（Intel） | `BotHub-<版本号>-x64.dmg` |
| Windows 10/11（x64） | `BotHub-Setup-<版本号>-x64.exe` |

> [!TIP]
> 目前的安装包还没有代码签名。
> - **macOS**：把 `BotHub.app` 拖进「应用程序」，第一次打开时右键选择「打开」（或在「系统设置 → 隐私与安全性」中点「仍要打开」）。也可以用 `xattr -cr /Applications/BotHub.app` 清除隔离属性。
> - **Windows**：如果 SmartScreen 提示「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」。

安装后点侧边栏的 **+**，选择平台并登录即可。每个 Bot 使用自己的账号。

**自动更新**：Windows 版会在后台从 GitHub Releases 下载新版本，一键安装；macOS 版会提示有新版本并打开下载页。

## 🤖 支持的平台

| 平台 | 协议与传输 | 支持的能力 |
| :--- | :--- | :--- |
| **Meta Muse**（`muse.ai`） | 独立 Electron 分区 + 原生 WebSocket 网关 | 多账号、邮箱验证码批量导入、单账号 HTTP/SOCKS5 代理、云端电脑、目标、协作节点、工作区文件、连接器审批与诊断 |
| **Grok Bot**（`grok.com`） | 经 Sand 网关（`*.sand.x.ai`）的 Connect-RPC / Protobuf | 多账号、Sand 云端工作区、实时流式输出、工具调用轨迹、会话、定时任务、记忆与技能 |
| **Hark**（`hark.com`） | WebSocket RPC + 多模态 REST | 浏览器登录（Google 或邮箱）、实时流式输出与后台回复同步、文件和图片附件、文档卡片、定时任务、记忆与连接器 |
| **Dot**（`chatgpt.com/dots`） | OpenAI Orbit/TBO REST + 服务器推送事件（SSE） | 浏览器 OAuth 登录或导入 Access/Refresh Token、加密保存令牌、实时流式输出、文件上传、技能、自动化、连接器与单账号代理 |

## ✨ 功能特性

- **多账号互不串号**：每个账号都在独立的 Electron `persist:` 分区或加密凭据槽位中，同一平台可以同时登录多个账号。
- **管理中心**：全屏管理视图，包含整体概览、Bot 筛选与搜索、批量连通性检测，以及各平台的账号、令牌和代理管理。
- **完整的智能体对话**：实时流式输出，展示思考过程和工具卡片；长时间后台任务可自动恢复；支持 Markdown 表格、代码高亮、文档预览和附件下载。
- **Bot 详情面板**：右侧面板按平台展示会话、定时任务、记忆、技能、文件和成员。
- **会动的头像**：每个 Bot 都有一个 `GrokBotMark` 动态角色，会跟随鼠标、在工作时做出反应；可以换形状和颜色，也可以上传照片。
- **默认安全**：令牌和代理密码通过 Electron `safeStorage`（macOS 上为钥匙串）加密，并以 `0600` 权限保存。代码中没有硬编码密钥，也没有任何遥测。
- **中英文界面**，支持浅色和深色主题。

## 🧰 本地开发

```bash
npm ci
npm run dev          # 启动 Electron + Vite，支持热更新
```

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Electron 主进程、preload 和 React 界面（热更新） |
| `npm run dev:web` | 只在浏览器里运行界面（不启动 Electron，不登录账号） |
| `npm run typecheck` | 检查 Node 和 Web 两端的类型 |
| `npm test` | 单元测试（Vitest） |
| `npm run build` | 类型检查并构建到 `out/` |
| `npm run dist:mac` / `npm run dist:win` | 打包 macOS `dmg` + `zip`（arm64 + x64）/ Windows NSIS 安装包到 `release/` |
| `npm run dist:dir` | 生成未打包的 macOS arm64 应用，方便冒烟测试 |

README 截图由虚构数据生成：`npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`。

## 🚀 发布流程

每次推送，CI（[`ci.yml`](../../.github/workflows/ci.yml)）都会在 macOS 和 Windows 上做类型检查、测试、构建和打包。

1. 修改 `package.json` 里的 `version` 并合并到 `main`。
2. 推送与版本号一致的标签 `vX.Y.Z`。
3. [`release.yml`](../../.github/workflows/release.yml) 会先创建草稿版本，分别构建 macOS（arm64 + x64 的 `dmg`/`zip`、`latest-mac.yml`）和 Windows（NSIS `exe`、`latest.yml`）并上传，确认文件齐全后自动发布。

默认不签名。在仓库中配置以下密钥后会自动签名和公证：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`（macOS），或 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`（Windows）。

## 📁 目录结构

```text
src/
  adapters/        各平台适配器（Meta Muse、Grok Bot、Hark、Dot）与统一的 PlatformAdapter 接口
  main/            Electron 主进程
    muse/          Muse 分区会话、批量登录与单账号代理路由
    muse-native/   Muse 原生 WebSocket 网关客户端（云端电脑、工作区等调用）
    grok/          Grok Bot Sand 认证、Connect-RPC 客户端与 IPC 处理
    hark/          Hark WebSocket/REST 客户端、附件上传与 IPC 处理
    dot/           OpenAI Dot（Orbit/TBO）客户端、加密令牌库、SSE 流式与 IPC
  preload/         通过 contextBridge 暴露为 window.electron 的类型化 API
  shared/          主进程与界面共用的 IPC 通道约定和类型
  renderer/        React + Tailwind + Zustand 桌面界面
    components/    侧边栏、对话区、详情面板、各平台面板、管理中心、GrokBotMark
    store/         Bot 状态、流式消息合并与本地持久化
scripts/screenshot/  用虚构数据生成 README 截图
```

## 📚 协议文档

各平台的通信协议和接口说明在 [`docs/`](../README.md) 目录：

- **OpenAI Dot**（`chatgpt.com/dots`）：[`docs/dot/protocol.md`](../dot/protocol.md)：OAuth PKCE 与网页会话认证、Orbit 配置、房间 SSE 与 REST、JSON-RPC 2.0 WebSocket、Pages、资料库与记忆迁移
- **Meta Muse**（`muse.ai`）：[`docs/museai/protocol.md`](../museai/protocol.md)：`Noise_XX_25519_ChaChaPoly_SHA256` 加密 WebSocket 握手与 65 个以上的 JSON-RPC 方法
- **xAI Grok Bot**（`grok.com`）：[`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md)：基于 HTTP/2 的 Connect-RPC 单次与流式调用、Sand 认证、技能、记忆、自动化与云端沙盒
- **Hark**（`hark.com`）：[`docs/hark/protocol.md`](../hark/protocol.md)：REST 与 NDJSON 流式接口、连接器、定时任务、虚拟机文件树与电脑会话

## ❓ 常见问题

<details>
<summary><b>BotHub 是这些平台的官方应用吗？</b></summary>

不是。BotHub 是独立开发的客户端，与 Meta、xAI、Hark、OpenAI 均无关联，使用的是你在各平台上自己的账号。

</details>

<details>
<summary><b>我的账号和令牌保存在哪里？</b></summary>

只保存在你自己的电脑上。网页会话保存在每个账号独立的 Electron 分区里；令牌和代理密码用 `safeStorage`（macOS 上为钥匙串）加密，并以 `0600` 权限保存。BotHub 不发送任何遥测数据。

</details>

<details>
<summary><b>macOS 提示无法打开 BotHub，怎么办？</b></summary>

安装包目前还没有签名。右键点应用选择「打开」，或运行 `xattr -cr /Applications/BotHub.app`。详见[快速开始](#-快速开始)。

</details>

<details>
<summary><b>消息一直显示「已送达 · 回复中」，重试会不会重复发送？</b></summary>

不会。平台一旦收到消息，BotHub 就不会再把它当成未发送。如果一直没有回复，会显示「没有收到回复」，并提供「再发一次」按钮，明确表示会再发一条同样的内容。

</details>

<details>
<summary><b>每个账号可以用不同的代理吗？</b></summary>

可以，Muse 和 Dot 账号支持 HTTP 或 SOCKS5 代理。如果代理无法生效，BotHub 会阻止该账号的网络请求，而不是退回直连。

</details>

## 📄 许可证

基于 [MIT 许可证](../../LICENSE) 开源。
