<div align="center">

# BotHub

**マルチプラットフォーム・マルチアカウント対応パーソナル AI エージェント統合デスクトップ**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: macOS arm64](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon)-111318.svg)](https://github.com/qybaihe/bothub/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · **日本語**

</div>

---

## 概要

**BotHub** は、Electron、React、TypeScript、Tailwind CSS で構築された macOS ネイティブのパーソナル AI エージェント統合ワークスペースです。複数の AI エージェントプラットフォーム（**Meta Muse**、**Grok Bot**、**Hark**、**Dot**）を単一のデスクトップアプリに統合し、各 **Bot** を独立したアカウントセッション（`partition`）に紐付けることで、ブラウザタブの乱립やセッション干渉なしに多数の AI エージェントを並行運用・管理できます。

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

## インストール

[GitHub Releases](https://github.com/qybaihe/bothub/releases) から最新の macOS (`arm64`) ビルドをダウンロードしてください。

> **macOS で未署名ビルドを起動する場合**: `BotHub.app` を `/Applications` に移動した後、右クリック →「開く」を選択するか、ターミナルで以下のコマンドを実行してください：
>
> ```bash
> xattr -cr /Applications/BotHub.app
> ```

## 開発とビルド

```bash
npm install
npm run dev          # Electron + Vite HMR 開発サーバーを起動
npm run typecheck    # Main / Preload / Renderer の TypeScript 型チェック
npm run build        # out/ へ本番ビルドを出力
npm run dist         # electron-builder で macOS arm64 dmg / zip をパッケージング
```

## ライセンス

[MIT License](./LICENSE)
