<div align="center">

# BotHub

**面向多平台、多帳號的桌面端個人 AI 智慧體工作台**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: macOS arm64](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon)-111318.svg)](https://github.com/qybaihe/bothub/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.md) · [简体中文](./README.zh-CN.md) · **繁體中文** · [日本語](./README.ja.md)

</div>

---

## 專案簡介

**BotHub** 是一款基於 Electron、React、TypeScript 與 Tailwind CSS 建構的 macOS 原生桌面端 AI 智慧體中樞。它將多個個人 AI Agent 平台（**Meta Muse**、**Grok Bot**、**Hark**、**Dot**）聚合在統一的原生介面中；每個 **Bot** 綁定獨立隔離的帳號工作階段（`partition`），支援同平台多帳號並行在線、即時串流對話、雲端電腦/工具呼叫檢視以及集中式管理中心。

## 已接入平台一覽

| 平台 | 協定與傳輸層 | 核心能力支援 |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | 獨立 Electron Partition + 原生 WebSocket 閘道 | 多帳號隔離登入、信箱驗證碼批次匯入、單帳號獨立 HTTP/SOCKS5 代理、雲端電腦（Computer）狀態檢視、目標（Goals）、協作節點（Peers）、工作區檔案、連接器審批與診斷 |
| **Grok Bot** (`grok.com`) | Sand 閘道 (`*.sand.x.ai`) Connect-RPC / Protobuf | 多帳號隔離登入、Sand 雲端工作區同步、即時串流輸出、工具呼叫軌跡展示、以及可互動的 `GrokBotMark` 動態幾何角色頭像引擎 |
| **Hark** (`hark.com`) | WebSocket RPC + 多模態 REST 介面 | 瀏覽器登入與工作階段恢復、串流對話與背景非同步回覆輪詢、圖片/檔案多模態上傳與下載、原生文件卡片預覽、排程任務、使用者記憶（Memories）與連接器管理 |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + SSE 即時串流 | 支援瀏覽器 OAuth 登入及 ChatGPT Access Token (`AT`) / Refresh Token (`RT`) 直接匯入、基於系統鑰匙圈 `safeStorage` 的憑證加密儲存、SSE 即時串流生成、檔案上傳、技能（Skills）、排程任務與連接器管理 |

## 核心特性

- **原生級多帳號工作階段隔離**
  每個帳號執行在獨立的 Electron `persist:` 分區或加密憑證槽位中，同一平台可同時掛載多個帳號與多個 Bot，互不串號。
- **全功能管理中心（Management Console）**
  內建全螢幕管理檢視（`SettingsView`），提供全域概覽大盤、依平台/狀態/關鍵字篩選的 Bot 清單、一鍵批次連通性檢測，以及針對四大平台的專屬帳號、Token 與代理管理面板。
- **深度適配的 Agent 聊天與產物體驗**
  - 完整呈現思考過程（Thinking Trace）、工具執行卡片（Tool Invocations）、長耗時任務背景防斷流恢復（Watchdog & Background Polling）。
  - 支援原生文件彈窗預覽（`NativeDocumentDialog`）、Markdown 表格與程式碼高亮、多模態附件上傳與本機儲存。
- **動態幾何角色頭像（`GrokBotMark`）**
  所有 Bot 預設配備可隨滑鼠視線互動、思考狀態律動的 `GrokBotMark` 動態幾何角色頭像，同時支援隨時切換形狀/配色或上傳自訂頭像圖片。
- **憑證安全與隱私保護**
  - 本機持久化的敏感憑證（如 Dot 的 `AT`/`RT` 及帳號代理密碼）預設透過 Electron `safeStorage`（macOS Keychain）加密並以 `0600` 權限落盤。
  - 程式碼庫零硬編碼金鑰、無任何第三方隱私遙測。

## 安裝說明

前往 [GitHub Releases](https://github.com/qybaihe/bothub/releases) 下載最新 macOS (`arm64`) 安裝包。

> **macOS 未簽章套件開啟提示**：將 `BotHub.app` 拖入 `/Applications` 後，首次開啟請右鍵點擊選「打開」，或在終端機執行以下指令移除隔離屬性：
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

## 本機開發與建置

```bash
npm install
npm run dev          # 啟動 Electron + Vite 熱更新開發環境
npm run typecheck    # 執行主行程、預載腳本與渲染行程 TypeScript 型別檢查
npm run build        # 編譯正式環境建置產物至 out/
npm run dist         # 使用 electron-builder 打包 macOS arm64 dmg 與 zip
```

## 協定與介面文件

四大平台適配器的底層傳輸協定、鑑權流程與介面規範位於 [`docs/`](./docs/README.md) 目錄：

- **OpenAI Dot (`chatgpt.com/dots`)**：[`docs/dot/protocol.md`](./docs/dot/protocol.md)
- **Meta Muse (`muse.ai`)**：[`docs/museai/protocol.md`](./docs/museai/protocol.md)
- **xAI Grok Bot (`grok.com`)**：[`docs/grokbot-protocol/protocol.md`](./docs/grokbot-protocol/protocol.md)
- **Hark (`hark.com`)**：[`docs/hark/protocol.md`](./docs/hark/protocol.md)

## 開源授權

基於 [MIT License](./LICENSE) 開源。
