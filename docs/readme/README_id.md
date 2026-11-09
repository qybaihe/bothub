<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · **Bahasa Indonesia** · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Satukan semua agen pribadi Anda dan gunakan dalam satu klien, seperti di Grok Bot**

**Aplikasi macOS dan Windows yang menyatukan bot Meta Muse, Grok Bot, Hark, dan Dot Anda dalam satu jendela, masing-masing masuk dengan akunnya sendiri yang terisolasi.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Rilis&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-mulai-cepat)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Lisensi-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Unduh untuk macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Unduh untuk Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 Semua rilis](https://github.com/qybaihe/bothub/releases) · [🐛 Laporkan masalah](https://github.com/qybaihe/bothub/issues)**

[Mulai cepat](#-mulai-cepat) · [Platform](#-platform-yang-didukung) · [Fitur](#-fitur) · [Pengembangan](#-pengembangan) · [Rilis](#-merilis-versi) · [Protokol](#-dokumentasi-protokol) · [Tanya jawab](#-tanya-jawab)

</div>

---

> [!NOTE]
> BotHub adalah klien independen dan tidak berafiliasi dengan Meta, xAI, Hark, atau OpenAI. Anda masuk dengan akun sendiri, dan kredensial tetap tersimpan di komputer Anda.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: bot Muse, Dot, Hark, dan Grok Bot yang dikelompokkan di bilah samping, sebuah percakapan, dan panel detail bot (data contoh)" width="100%">
</picture>
<sub>Tangkapan layar dengan data contoh fiktif.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Semua agen, satu jendela
Bot Muse, Grok Bot, Hark, dan Dot berdampingan, dikelompokkan di bilah samping, masing-masing dengan percakapan, panel detail, dan pengaturannya sendiri.

</td>
<td width="33%" valign="top">

### 🔐 Akun terisolasi
Setiap akun berjalan di partisi sesinya sendiri atau slot kredensial terenkripsi, sehingga beberapa akun di platform yang sama tidak pernah tercampur.

</td>
<td width="33%" valign="top">

### ✅ Pengiriman andal
Pesan menampilkan status *mengirim*, *terkirim · sedang membalas*, *tidak ada balasan*, atau *gagal*. Pesan yang sudah diterima platform tidak pernah dianggap belum terkirim, jadi mencoba lagi tidak akan mengirimnya dua kali.

</td>
</tr>
</table>

---

## ⚡ Mulai cepat

Unduh berkas untuk sistem Anda dari [rilis terbaru](https://github.com/qybaihe/bothub/releases/latest):

| Sistem | Berkas |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<versi>-arm64.dmg` |
| macOS, Intel | `BotHub-<versi>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<versi>-x64.exe` |

> [!TIP]
> Build belum ditandatangani secara digital.
> - **macOS**: seret `BotHub.app` ke folder Aplikasi, lalu saat pertama kali klik kanan dan pilih **Buka** (atau *Pengaturan Sistem → Privasi & Keamanan → Tetap Buka*). Anda juga bisa menghapus tanda karantina dengan `xattr -cr /Applications/BotHub.app`.
> - **Windows**: jika SmartScreen menampilkan "Windows melindungi PC Anda", klik **Info selengkapnya → Tetap jalankan**.

Setelah itu klik **+** di bilah samping, pilih platform, lalu masuk. Setiap bot memakai akunnya sendiri.

**Pembaruan**: di Windows, BotHub mengunduh versi baru di latar belakang dan memasangnya dengan satu klik. Di macOS, BotHub memberi tahu saat ada versi baru dan membuka halaman unduhan.

## 🤖 Platform yang didukung

| Platform | Protokol & transport | Yang Anda dapatkan |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Partisi Electron terisolasi + gateway WebSocket native | Banyak akun, impor massal dengan kode email, proxy HTTP/SOCKS5 per akun, komputer awan, tujuan, peer, berkas ruang kerja, persetujuan konektor, dan diagnostik |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf melalui gateway Sand (`*.sand.x.ai`) | Banyak akun, ruang kerja awan Sand, streaming langsung, riwayat pemanggilan alat, sesi, tugas terjadwal, memori, dan keterampilan |
| **Hark** (`hark.com`) | WebSocket RPC + REST multimodal | Masuk lewat browser (Google atau email), streaming langsung dengan sinkronisasi balasan di latar belakang, lampiran berkas dan gambar, kartu dokumen, tugas terjadwal, memori, dan konektor |
| **Dot** (`chatgpt.com/dots`) | REST OpenAI Orbit/TBO + server-sent events (SSE) | Masuk OAuth lewat browser atau impor Access/Refresh Token, penyimpanan token terenkripsi, streaming langsung, unggah berkas, keterampilan, otomatisasi, konektor, dan proxy per akun |

## ✨ Fitur

- **Banyak akun tanpa tercampur**: setiap akun berada di partisi Electron `persist:` sendiri atau slot kredensial terenkripsi, sehingga Anda bisa memakai beberapa akun dari platform yang sama sekaligus.
- **Konsol manajemen**: tampilan layar penuh dengan ringkasan, filter dan pencarian bot, pengecekan koneksi massal, serta pengelolaan akun, token, dan proxy per platform.
- **Obrolan agen yang lengkap**: streaming langsung dengan proses berpikir dan kartu alat, pemulihan tugas latar belakang yang panjang, tabel Markdown, penyorotan kode, pratinjau dokumen, dan unduhan lampiran.
- **Panel detail bot**: panel kanan menampilkan sesi, tugas terjadwal, memori, keterampilan, berkas, dan anggota setiap bot, sesuai platformnya.
- **Avatar yang hidup**: setiap bot punya karakter animasi `GrokBotMark` yang mengikuti penunjuk dan bereaksi saat bekerja; pilih bentuk dan warna atau unggah foto.
- **Aman sejak awal**: token dan kata sandi proxy dienkripsi dengan `safeStorage` dari Electron (Keychain di macOS) dan disimpan dengan izin `0600`. Tidak ada rahasia di dalam kode dan tidak ada telemetri.
- **Antarmuka bahasa Inggris dan Mandarin**, tema terang dan gelap.

## 🧰 Pengembangan

```bash
npm ci
npm run dev          # Electron + Vite dengan hot reload
```

| Perintah | Keterangan |
| :--- | :--- |
| `npm run dev` | Menjalankan proses utama Electron, preload, dan antarmuka React dengan hot reload |
| `npm run dev:web` | Menjalankan antarmuka saja di browser (tanpa Electron, tanpa akun) |
| `npm run typecheck` | Memeriksa tipe untuk target Node dan web |
| `npm test` | Uji unit (Vitest) |
| `npm run build` | Memeriksa tipe dan membangun bundel produksi ke `out/` |
| `npm run dist:mac` / `npm run dist:win` | Mengemas macOS `dmg` + `zip` (arm64 + x64) / installer NSIS Windows ke `release/` |
| `npm run dist:dir` | Aplikasi macOS arm64 tanpa kemasan untuk uji cepat |

Tangkapan layar README dibuat dari data fiktif: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Merilis versi

Setiap kali ada push, CI ([`ci.yml`](../../.github/workflows/ci.yml)) memeriksa tipe, menjalankan uji, membangun, dan mengemas di macOS dan Windows.

1. Naikkan `version` di `package.json` lalu gabungkan ke `main`.
2. Kirim tag `vX.Y.Z` yang sesuai dengan versinya.
3. [`release.yml`](../../.github/workflows/release.yml) membuat draf rilis, membangun macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) dan Windows (NSIS `exe`, `latest.yml`), mengunggah semuanya, lalu menerbitkan rilis setelah semua berkas lengkap.

Secara bawaan build tidak ditandatangani. Penandatanganan dan notarisasi aktif jika secret repositori berikut diatur: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) atau `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Struktur proyek

```text
src/
  adapters/        Adaptor platform (Meta Muse, Grok Bot, Hark, Dot) dan antarmuka bersama PlatformAdapter
  main/            Proses utama Electron
    muse/          Sesi partisi Muse, login massal, dan perutean proxy per akun
    muse-native/   Klien gateway WebSocket native untuk komputer awan dan ruang kerja Muse
    grok/          Autentikasi Sand, klien Connect-RPC, dan handler IPC untuk Grok Bot
    hark/          Klien WebSocket/REST, pengunggah lampiran, dan handler IPC untuk Hark
    dot/           Klien OpenAI Dot (Orbit/TBO), brankas token terenkripsi, streaming SSE, dan IPC
  preload/         API contextBridge bertipe yang tersedia sebagai window.electron
  shared/          Kontrak kanal IPC dan tipe yang dipakai bersama proses utama dan antarmuka
  renderer/        Antarmuka desktop React + Tailwind + Zustand
    components/    Bilah samping, obrolan, panel detail, panel platform, konsol manajemen, GrokBotMark
    store/         Status bot, penggabungan pesan streaming, dan penyimpanan lokal
scripts/screenshot/  Tangkapan layar README dari data contoh fiktif
```

## 📚 Dokumentasi protokol

Protokol dan catatan API setiap platform ada di [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): autentikasi OAuth PKCE dan sesi web, profil Orbit, SSE dan REST untuk ruang, WebSocket JSON-RPC 2.0, Pages, Pustaka, dan migrasi memori
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): jabat tangan WebSocket `Noise_XX_25519_ChaChaPoly_SHA256` dan lebih dari 65 metode JSON-RPC
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): panggilan Connect-RPC unary dan streaming melalui HTTP/2, autentikasi Sand, keterampilan, memori, otomatisasi, dan sandbox awan
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): endpoint REST dan streaming NDJSON, konektor, tugas terjadwal, pohon berkas VM, dan sesi komputer

## ❓ Tanya jawab

<details>
<summary><b>Apakah BotHub aplikasi resmi dari platform-platform ini?</b></summary>

Bukan. BotHub adalah klien independen dan tidak berafiliasi dengan Meta, xAI, Hark, atau OpenAI. BotHub memakai akun Anda sendiri di setiap platform.

</details>

<details>
<summary><b>Di mana akun dan token saya disimpan?</b></summary>

Hanya di komputer Anda. Sesi web disimpan di partisi Electron terpisah untuk tiap akun; token dan kata sandi proxy dienkripsi dengan `safeStorage` (Keychain di macOS) dan disimpan dengan izin `0600`. BotHub tidak mengirim telemetri.

</details>

<details>
<summary><b>macOS bilang BotHub tidak bisa dibuka. Apa yang harus saya lakukan?</b></summary>

Build belum ditandatangani. Klik kanan aplikasinya dan pilih **Buka**, atau jalankan `xattr -cr /Applications/BotHub.app`. Lihat [Mulai cepat](#-mulai-cepat).

</details>

<details>
<summary><b>Pesan lama sekali berstatus "terkirim · sedang membalas". Apakah mencoba lagi akan mengirimnya dua kali?</b></summary>

Tidak. Begitu platform menerima pesan, BotHub tidak pernah menganggapnya belum terkirim. Jika balasan tidak datang, muncul *tidak ada balasan* dengan tombol **Kirim lagi** yang jelas menyatakan akan mengirim salinan kedua.

</details>

<details>
<summary><b>Bisakah setiap akun memakai proxy sendiri?</b></summary>

Bisa, untuk akun Muse dan Dot (HTTP atau SOCKS5). Jika proxy tidak bisa diterapkan, BotHub memblokir lalu lintas akun tersebut alih-alih beralih ke koneksi langsung.

</details>

## 📄 Lisensi

Dirilis dengan [Lisensi MIT](../../LICENSE).
