<div align="center">

# BotHub

**あらゆるパーソナル AI エージェントを 1 つのデスクトップに**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?label=Release&color=111318)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://github.com/qybaihe/bothub/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-6E56CF.svg)](https://github.com/qybaihe/bothub/releases/latest)

[![ダウンロード](https://img.shields.io/badge/%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/qybaihe/bothub/releases/latest)
[![ダウンロード](https://img.shields.io/badge/%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/qybaihe/bothub/releases/latest)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · **日本語**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bothub-dark.webp">
  <img src="docs/assets/bothub-light.webp" alt="BotHub：サイドバーに並ぶ Muse・Dot・Hark・Grok Bot の Bot と会話画面（サンプルデータ）" width="100%">
</picture>

</div>

<p align="center"><sub>架空のサンプルデータによるスクリーンショット：Muse・Dot・Hark・Grok Bot の Bot をグループごとに表示。</sub></p>

---

## 概要

**BotHub** は、Electron、React、TypeScript、Tailwind CSS で構築された macOS / Windows 向けのパーソナル AI エージェント統合ワークスペースです。複数の AI エージェントプラットフォーム（**Meta Muse**、**Grok Bot**、**Hark**、**Dot**）を単一のデスクトップアプリに統合し、各 **Bot** を独立したアカウントセッション（`partition`）に紐付けることで、ブラウザタブの乱立やセッション干渉なしに多数の AI エージェントを並行運用・管理できます。

## 対応プラットフォーム

| プラットフォーム | プロトコル / 通信方式 | 主な対応機能 |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | 独立 Electron Partition + ネイティブ WebSocket ゲートウェイ | マルチアカウント分離、メール認証コードによる一括インポート、アカウント別 HTTP/SOCKS5 プロキシ、クラウド PC（Computer）状態監視、Goals、Peers、ファイル管理、コネクタ承認、診断機能 |
| **Grok Bot** (`grok.com`) | Sand ゲートウェイ (`*.sand.x.ai`) Connect-RPC / Protobuf | マルチアカウントログイン、Sand クラウドワークスペース同期、リアルタイムストリーミング、ツール呼び出し履歴の可視化、インタラクティブな `GrokBotMark` キャラクターアバター |
| **Hark** (`hark.com`) | WebSocket RPC + マルチモーダル REST API | ブラウザログイン、リアルタイムストリーミング + バックグラウンド応答同期、画像・ファイル添付と保存、ネイティブドキュメントプレビュー、スケジュールタスク、メモリ（Memories）、外部コネクタ |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + Server-Sent Events (SSE) | ブラウザ OAuth ログインおよび ChatGPT Access Token (`AT`) / Refresh Token (`RT`) インポート、macOS キーチェーン（`safeStorage`）による暗号化保存、SSE ストリーミング、ファイル添付、スキル、自動化タスク、コネクタ |

## 主な特徴

- **厳格なマルチアカウント分離**
  すべてのアカウントは独立した Electron `persist:` パーティションまたは暗号化スロット内で動作し、同一プラットフォームの複数アカウントを同時にログイン・運用できます。
- **統合管理コンソール（Management Console）**
  フルスクリーンの管理画面（`SettingsView`）を備え、稼働状況ダッシュボード、プラットフォーム・ステータス別のフィルタリング、一括接続テスト、アカウント・トークン・プロキシの集中管理が可能です。
- **エージェント対話・成果物プレビューの最適化**
  - 思考プロセス（Thinking Trace）、ツール実行カード、長時間タスク向けの自動復旧ウォッチドッグを搭載。
  - ネイティブドキュメントプレビュー（`NativeDocumentDialog`）、Markdown テーブル・コードハイライト、添付ファイルのワンクリック保存に対応。
- **インタラクティブな `GrokBotMark` アバター**
  マウスポインタ追従や思考中アニメーションを備えたプロシージャル SVG アバターを全 Bot に標準搭載し、形状・カラーのカスタマイズや独自画像のアップロードにも対応。
- **セキュリティとプライバシー設計**
  - トークンやプロキシ認証情報は Electron `safeStorage`（macOS Keychain）と `0600` パーミッションで暗号化保存。
  - ハードコードされた秘密情報や外部テレメトリは一切含まれません。
- **確実なメッセージ配信**
  メッセージは「送信中」「配信済み・返信待ち」「返信なし」「送信失敗」を区別して表示します。プラットフォームが受け取ったメッセージを未送信扱いにしないため、再試行しても二重送信されません。

## インストール

[最新リリース](https://github.com/qybaihe/bothub/releases/latest) からダウンロードしてください：

| OS | ファイル |
| :--- | :--- |
| macOS（Apple シリコン） | `BotHub-<version>-arm64.dmg` |
| macOS（Intel） | `BotHub-<version>-x64.dmg` |
| Windows 10/11（x64） | `BotHub-Setup-<version>-x64.exe` |

> **macOS（未署名）**：`BotHub.app` を「アプリケーション」に移動し、初回は右クリック →「開く」を選択してください（または「システム設定 → プライバシーとセキュリティ」で「このまま開く」）。ターミナルで隔離属性を削除することもできます：
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```
>
> **Windows（未署名）**：SmartScreen に「Windows によって PC が保護されました」と表示された場合は「詳細情報 → 実行」をクリックしてください。

アップデート：Windows 版は GitHub Releases から新バージョンをバックグラウンドでダウンロードし、ワンクリックでインストールできます。macOS 版は新バージョンを通知し、ダウンロードページを開きます。

## 開発とビルド

```bash
npm ci
npm run dev          # Electron + Vite（ホットリロード）
```

| コマンド | 説明 |
| :--- | :--- |
| `npm run dev` | Electron メイン・preload・React レンダラーをホットリロードで起動 |
| `npm run dev:web` | レンダラーのみをブラウザで起動（Electron なし・アカウントなし） |
| `npm run typecheck` | Node / Web 両ターゲットの型チェック |
| `npm test` | ユニットテスト（Vitest） |
| `npm run build` | 型チェックと `out/` への本番ビルド |
| `npm run dist:mac` / `npm run dist:win` | macOS `dmg` + `zip`（arm64 + x64）/ Windows NSIS インストーラーを `release/` に作成 |
| `npm run dist:dir` | 簡易確認用の未パッケージ macOS arm64 アプリ |

README のスクリーンショットは架空データから生成しています：`npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`。

## リリース手順

CI（`.github/workflows/ci.yml`）がプッシュごとに macOS と Windows で型チェック・テスト・ビルド・パッケージングを行います。

1. `package.json` の `version` を更新して `main` にマージします。
2. バージョンと一致するタグ `vX.Y.Z` をプッシュします。
3. `release.yml` が下書きリリースを作成し、macOS（arm64 + x64 の `dmg`/`zip`、`latest-mac.yml`）と Windows（NSIS `exe`、`latest.yml`）をビルドしてアップロード、すべて揃った時点で公開します。

既定では未署名です。リポジトリシークレット `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`（macOS）または `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`（Windows）を設定すると署名・公証が有効になります。

## ディレクトリ構成

```text
src/
  adapters/        各プラットフォームのアダプター（Meta Muse、Grok Bot、Hark、Dot）と共通 PlatformAdapter インターフェース
  main/            Electron メインプロセス
    muse/          Muse パーティションのセッション管理、一括ログイン、アカウント別プロキシ
    muse-native/   Muse ネイティブ WebSocket ゲートウェイクライアント（クラウド PC、ワークスペースファイル、ツール承認）
    grok/          Grok Bot の Sand 認証、Connect-RPC クライアント、IPC
    hark/          Hark の WebSocket/REST クライアント、添付ファイルのアップロード、IPC
    dot/           OpenAI Dot (Orbit/TBO) クライアント、safeStorage 認証情報ストア、SSE ストリーム、IPC
  preload/         contextBridge で公開する型付き API (window.bothub)
  shared/          メイン・レンダラー共通の IPC 定義と型
  renderer/        React + Tailwind CSS + Zustand による UI
    components/    サイドバー、チャット、インスペクター、管理画面、GrokBotMark
    store/         Zustand による Bot の状態管理、ストリーミング統合、ローカル保存
```

## プロトコル・API ドキュメント

各プラットフォームアダプターのプロトコル仕様および API リファレンスは [`docs/`](./docs/README.md) に収録されています：

- **OpenAI Dot (`chatgpt.com/dots`)**: [`docs/dot/protocol.md`](./docs/dot/protocol.md)
- **Meta Muse (`muse.ai`)**: [`docs/museai/protocol.md`](./docs/museai/protocol.md)
- **xAI Grok Bot (`grok.com`)**: [`docs/grokbot-protocol/protocol.md`](./docs/grokbot-protocol/protocol.md)
- **Hark (`hark.com`)**: [`docs/hark/protocol.md`](./docs/hark/protocol.md)

## ライセンス

[MIT License](./LICENSE)
