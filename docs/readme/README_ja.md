<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · **日本語** · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **あらゆるパーソナルエージェントを集めて、ひとつのクライアントで Grok Bot のように使いこなす**

**Meta Muse・Grok Bot・Hark・Dot の Bot をひとつのウィンドウにまとめる macOS / Windows アプリ。Bot ごとに分離されたアカウントでサインインします。**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=%E6%9C%80%E6%96%B0%E7%89%88&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/%E5%AF%BE%E5%BF%9COS-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-クイックスタート)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ macOS 版をダウンロード](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Windows 版をダウンロード](https://github.com/qybaihe/bothub/releases/latest) · [📦 すべてのリリース](https://github.com/qybaihe/bothub/releases) · [🐛 問題を報告](https://github.com/qybaihe/bothub/issues)**

[クイックスタート](#-クイックスタート) · [対応プラットフォーム](#-対応プラットフォーム) · [主な機能](#-主な機能) · [開発](#-開発) · [リリース手順](#-リリース手順) · [プロトコル資料](#-プロトコル資料) · [よくある質問](#-よくある質問)

</div>

---

> [!NOTE]
> BotHub は独立したクライアントで、Meta・xAI・Hark・OpenAI とは関係ありません。ご自身のアカウントでサインインし、認証情報はお使いのコンピューターにのみ保存されます。

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub：サイドバーにグループ分けされた Muse・Dot・Hark・Grok Bot の Bot、会話画面、Bot の詳細パネル（サンプルデータ）" width="100%">
</picture>
<sub>スクリーンショットは架空のサンプルデータです。</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 すべてのエージェントをひとつの画面に
Muse・Grok Bot・Hark・Dot の Bot をサイドバーにグループごとに並べ、それぞれに会話・詳細パネル・設定があります。

</td>
<td width="33%" valign="top">

### 🔐 アカウントを分離
アカウントごとに専用のセッションパーティションまたは暗号化された認証情報スロットで動作するため、同じプラットフォームの複数アカウントが混ざりません。

</td>
<td width="33%" valign="top">

### ✅ 確実な送信
メッセージには「送信中」「配信済み · 返信待ち」「返信なし」「送信失敗」が表示されます。プラットフォームが受け付けたメッセージを未送信として扱うことはないため、再試行で二重送信されません。

</td>
</tr>
</table>

---

## ⚡ クイックスタート

[最新リリース](https://github.com/qybaihe/bothub/releases/latest) からお使いの OS 用のファイルをダウンロードしてください。

| OS | ファイル |
| :--- | :--- |
| macOS（Apple シリコン） | `BotHub-<バージョン>-arm64.dmg` |
| macOS（Intel） | `BotHub-<バージョン>-x64.dmg` |
| Windows 10/11（x64） | `BotHub-Setup-<バージョン>-x64.exe` |

> [!TIP]
> 現在のビルドはコード署名されていません。
> - **macOS**：`BotHub.app` を「アプリケーション」にドラッグし、初回は右クリックして「開く」を選びます（または「システム設定 → プライバシーとセキュリティ」で「このまま開く」）。`xattr -cr /Applications/BotHub.app` で隔離属性を削除することもできます。
> - **Windows**：SmartScreen に「Windows によって PC が保護されました」と表示されたら、「詳細情報 → 実行」をクリックします。

インストール後、サイドバーの **+** をクリックしてプラットフォームを選び、サインインします。Bot ごとに個別のアカウントを使います。

**アップデート**：Windows 版は GitHub Releases から新しいバージョンをバックグラウンドでダウンロードし、ワンクリックでインストールします。macOS 版は新しいバージョンを通知し、ダウンロードページを開きます。

## 🤖 対応プラットフォーム

| プラットフォーム | プロトコルと通信方式 | 主な機能 |
| :--- | :--- | :--- |
| **Meta Muse**（`muse.ai`） | 分離された Electron パーティション + ネイティブ WebSocket ゲートウェイ | 複数アカウント、メール認証コードによる一括インポート、アカウントごとの HTTP/SOCKS5 プロキシ、クラウドコンピューター、ゴール、ピア、ワークスペースファイル、コネクタの承認と診断 |
| **Grok Bot**（`grok.com`） | Sand ゲートウェイ（`*.sand.x.ai`）経由の Connect-RPC / Protobuf | 複数アカウント、Sand クラウドワークスペース、リアルタイムストリーミング、ツール呼び出しの履歴、セッション、定期タスク、メモリー、スキル |
| **Hark**（`hark.com`） | WebSocket RPC + マルチモーダル REST | ブラウザーでのサインイン（Google またはメール）、リアルタイムストリーミングとバックグラウンドでの返信同期、ファイル・画像の添付、ドキュメントカード、定期タスク、メモリー、コネクタ |
| **Dot**（`chatgpt.com/dots`） | OpenAI Orbit/TBO REST + サーバー送信イベント（SSE） | ブラウザーでの OAuth サインインまたは Access/Refresh Token のインポート、トークンの暗号化保存、リアルタイムストリーミング、ファイルアップロード、スキル、オートメーション、コネクタ、アカウントごとのプロキシ |

## ✨ 主な機能

- **複数アカウントでも混線なし**：各アカウントは専用の Electron `persist:` パーティションまたは暗号化された認証情報スロットで動作し、同じプラットフォームの複数アカウントを同時に使えます。
- **管理コンソール**：全体の概要、Bot の絞り込みと検索、一括接続チェック、プラットフォームごとのアカウント・トークン・プロキシ管理をまとめた全画面ビュー。
- **充実したエージェントチャット**：思考過程やツールカードを含むリアルタイムストリーミング、長時間のバックグラウンドタスクの自動復旧、Markdown の表、コードのハイライト、ドキュメントのプレビュー、添付ファイルのダウンロード。
- **Bot の詳細パネル**：右側のパネルに、プラットフォームに応じてセッション・定期タスク・メモリー・スキル・ファイル・メンバーを表示します。
- **動くアバター**：すべての Bot に `GrokBotMark` のキャラクターがあり、ポインターを目で追い、作業中は反応します。形や色を変えたり、写真をアップロードしたりできます。
- **安全な初期設定**：トークンとプロキシのパスワードは Electron `safeStorage`（macOS ではキーチェーン）で暗号化し、`0600` の権限で保存します。ハードコードされた秘密情報もテレメトリーもありません。
- **英語と中国語の UI**、ライトテーマとダークテーマに対応。

## 🧰 開発

```bash
npm ci
npm run dev          # Electron + Vite（ホットリロード）
```

| コマンド | 説明 |
| :--- | :--- |
| `npm run dev` | Electron のメインプロセス、preload、React の画面をホットリロードで起動 |
| `npm run dev:web` | 画面だけをブラウザーで起動（Electron なし、アカウントなし） |
| `npm run typecheck` | Node と Web の両方を型チェック |
| `npm test` | ユニットテスト（Vitest） |
| `npm run build` | 型チェックして `out/` に本番ビルド |
| `npm run dist:mac` / `npm run dist:win` | macOS の `dmg` + `zip`（arm64 + x64）/ Windows の NSIS インストーラーを `release/` に作成 |
| `npm run dist:dir` | 動作確認用に未パッケージの macOS arm64 アプリを作成 |

README のスクリーンショットは架空のデータから生成しています：`npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`。

## 🚀 リリース手順

プッシュのたびに CI（[`ci.yml`](../../.github/workflows/ci.yml)）が macOS と Windows で型チェック・テスト・ビルド・パッケージングを行います。

1. `package.json` の `version` を上げて `main` にマージします。
2. バージョンと同じタグ `vX.Y.Z` をプッシュします。
3. [`release.yml`](../../.github/workflows/release.yml) が下書きリリースを作成し、macOS（arm64 + x64 の `dmg`/`zip`、`latest-mac.yml`）と Windows（NSIS `exe`、`latest.yml`）をビルドしてアップロードし、すべてのファイルがそろったら公開します。

既定では署名しません。次のリポジトリシークレットを設定すると署名と公証が有効になります：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`（macOS）、または `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`（Windows）。

## 📁 ディレクトリ構成

```text
src/
  adapters/        各プラットフォームのアダプター（Meta Muse、Grok Bot、Hark、Dot）と共通の PlatformAdapter インターフェース
  main/            Electron のメインプロセス
    muse/          Muse のパーティションセッション、一括サインイン、アカウントごとのプロキシ
    muse-native/   Muse のネイティブ WebSocket ゲートウェイクライアント（クラウドコンピューター、ワークスペースなど）
    grok/          Grok Bot の Sand 認証、Connect-RPC クライアント、IPC ハンドラー
    hark/          Hark の WebSocket/REST クライアント、添付ファイルのアップロード、IPC ハンドラー
    dot/           OpenAI Dot（Orbit/TBO）クライアント、暗号化トークン保管庫、SSE ストリーミング、IPC
  preload/         contextBridge で window.electron として公開する型付き API
  shared/          メインプロセスと画面で共有する IPC チャネルの定義と型
  renderer/        React + Tailwind + Zustand のデスクトップ UI
    components/    サイドバー、チャット、詳細パネル、各プラットフォームのパネル、管理コンソール、GrokBotMark
    store/         Bot の状態、ストリーミングメッセージの統合、ローカル保存
scripts/screenshot/  架空のデータから README のスクリーンショットを生成
```

## 📚 プロトコル資料

各プラットフォームの通信プロトコルと API のメモは [`docs/`](../README.md) にあります。

- **OpenAI Dot**（`chatgpt.com/dots`）：[`docs/dot/protocol.md`](../dot/protocol.md)：OAuth PKCE と Web セッション認証、Orbit プロファイル、ルームの SSE と REST、JSON-RPC 2.0 WebSocket、Pages、ライブラリ、メモリーの移行
- **Meta Muse**（`muse.ai`）：[`docs/museai/protocol.md`](../museai/protocol.md)：`Noise_XX_25519_ChaChaPoly_SHA256` による暗号化 WebSocket ハンドシェイクと 65 以上の JSON-RPC メソッド
- **xAI Grok Bot**（`grok.com`）：[`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md)：HTTP/2 上の Connect-RPC（単発とストリーミング）、Sand 認証、スキル、メモリー、オートメーション、クラウドサンドボックス
- **Hark**（`hark.com`）：[`docs/hark/protocol.md`](../hark/protocol.md)：REST と NDJSON ストリーミングのエンドポイント、コネクタ、定期タスク、VM のファイルツリー、コンピューターセッション

## ❓ よくある質問

<details>
<summary><b>BotHub は各プラットフォームの公式アプリですか？</b></summary>

いいえ。BotHub は独立したクライアントで、Meta・xAI・Hark・OpenAI とは関係ありません。各プラットフォームのご自身のアカウントを使います。

</details>

<details>
<summary><b>アカウントやトークンはどこに保存されますか？</b></summary>

お使いのコンピューターにのみ保存されます。Web セッションはアカウントごとの Electron パーティションに、トークンとプロキシのパスワードは `safeStorage`（macOS ではキーチェーン）で暗号化して `0600` の権限で保存します。BotHub はテレメトリーを送信しません。

</details>

<details>
<summary><b>macOS で BotHub を開けないと表示されます。</b></summary>

ビルドはまだ署名されていません。アプリを右クリックして「開く」を選ぶか、`xattr -cr /Applications/BotHub.app` を実行してください。詳しくは[クイックスタート](#-クイックスタート)をご覧ください。

</details>

<details>
<summary><b>「配信済み · 返信待ち」のままです。再試行すると二重送信されますか？</b></summary>

いいえ。プラットフォームが受け付けたメッセージを BotHub が未送信として扱うことはありません。返信が届かない場合は「返信なし」と表示され、同じ内容をもう一度送ることがはっきり分かる「もう一度送信」ボタンが出ます。

</details>

<details>
<summary><b>アカウントごとに別のプロキシを使えますか？</b></summary>

はい。Muse と Dot のアカウントで HTTP または SOCKS5 プロキシを使えます。プロキシを適用できない場合、直接接続に切り替えるのではなく、そのアカウントの通信を止めます。

</details>

## 📄 ライセンス

[MIT ライセンス](../../LICENSE)で公開しています。
