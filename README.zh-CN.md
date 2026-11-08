<div align="center">

# BotHub

**面向多平台、多账号的桌面端个人 AI 智能体工作台**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: macOS arm64](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon)-111318.svg)](https://github.com/qybaihe/bothub/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.md) · **简体中文** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

</div>

---

## 项目简介

**BotHub** 是一款基于 Electron、React、TypeScript 与 Tailwind CSS 构建的 macOS 原生桌面端 AI 智能体中枢。它将多个个人 AI Agent 平台（**Meta Muse**、**Grok Bot**、**Hark**、**Dot**）聚合在统一的原生界面中；每个 **Bot** 绑定独立隔离的账号会话（`partition`），支持同平台多账号并行在线、实时流式对话、云端电脑/工具调用检视以及集中式管理中心。

## 已接入平台一览

| 平台 | 协议与传输层 | 核心能力支持 |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | 独立 Electron Partition + 原生 WebSocket 网关 | 多账号隔离登录、邮箱验证码批量导入、单账号独立 HTTP/SOCKS5 代理、云端电脑（Computer）状态检视、目标（Goals）、协作节点（Peers）、工作区文件、连接器审批与诊断 |
| **Grok Bot** (`grok.com`) | Sand 网关 (`*.sand.x.ai`) Connect-RPC / Protobuf | 多账号隔离登录、Sand 云端工作区同步、实时流式输出、工具调用轨迹展示、以及可交互的 `GrokBotMark` 动态几何角色头像引擎 |
| **Hark** (`hark.com`) | WebSocket RPC + 多模态 REST 接口 | 浏览器登录与会话恢复、流式对话与后台异步回复轮询、图片/文件多模态上传与下载、原生文档卡片预览、定时任务、用户记忆（Memories）与连接器管理 |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + SSE 实时流 | 支持浏览器 OAuth 登录及 ChatGPT Access Token (`AT`) / Refresh Token (`RT`) 直接导入、基于系统钥匙串 `safeStorage` 的凭据加密存储、SSE 实时流式生成、文件上传、技能（Skills）、定时任务与连接器管理 |

## 核心特性

- **原生级多账号会话隔离**
  每个账号运行在独立的 Electron `persist:` 分区或加密凭据槽位中，同一平台可同时挂载多个账号与多个 Bot，互不串号。
- **全功能管理中心（Management Console）**
  内置全屏管理视图（`SettingsView`），提供全局概览大盘、按平台/状态/关键字筛选的 Bot 列表、一键批量连通性检测，以及针对四大平台的专属账号、Token 与代理管理面板。
- **深度适配的 Agent 聊天与产物体验**
  - 完整呈现思考过程（Thinking Trace）、工具执行卡片（Tool Invocations）、长耗时任务后台防断流恢复（Watchdog & Background Polling）。
  - 支持原生文档弹窗预览（`NativeDocumentDialog`）、Markdown 表格与代码高亮、多模态附件上传与本地保存。
- **动态几何角色头像（`GrokBotMark`）**
  所有 Bot 默认配备可随鼠标视线互动、思考状态律动的 `GrokBotMark` 动态几何角色头像，同时支持随时切换形状/配色或上传自定义头像图片。
- **凭据安全与隐私保护**
  - 本地持久化的敏感凭据（如 Dot 的 `AT`/`RT` 及账号代理密码）默认通过 Electron `safeStorage`（macOS Keychain）加密并以 `0600` 权限落盘。
  - 代码库零硬编码密钥、无任何第三方隐私遥测。

## 安装说明

前往 [GitHub Releases](https://github.com/qybaihe/bothub/releases) 下载最新 macOS (`arm64`) 安装包。

> **macOS 未签名包打开提示**：将 `BotHub.app` 拖入 `/Applications` 后，首次打开请右键点击选「打开」，或在终端执行以下命令移除隔离属性：
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

## 本地开发与构建

```bash
npm install
npm run dev          # 启动 Electron + Vite 热更新开发环境
npm run typecheck    # 运行主进程、预加载脚本与渲染进程 TypeScript 类型检查
npm run build        # 编译生产构建产物至 out/
npm run dist         # 使用 electron-builder 打包 macOS arm64 dmg 与 zip
```

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Electron 主进程、预加载脚本与 React 渲染层热更新 |
| `npm run typecheck` | 对 Node 侧（`tsconfig.node.json`）与 Web 侧（`tsconfig.web.json`）执行类型检查 |
| `npm run build` | 编译生产环境代码至 `out/` 目录 |
| `npm run dist` | 通过 `electron-builder` 打包 macOS `dmg` 与 `zip` 发行包 |

## 目录结构

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

## 开源协议

基于 [MIT License](./LICENSE) 开源。
