<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · **Deutsch** · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Alle Ihre persönlichen Agenten an einem Ort – in einem einzigen Client, genau wie Grok Bot**

**Eine App für macOS und Windows, die Ihre Bots von Meta Muse, Grok Bot, Hark und Dot in einem Fenster vereint – jeder mit seinem eigenen, isolierten Konto.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Version&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Plattform-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-schnellstart)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Lizenz-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Für macOS herunterladen](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Für Windows herunterladen](https://github.com/qybaihe/bothub/releases/latest) · [📦 Alle Versionen](https://github.com/qybaihe/bothub/releases) · [🐛 Problem melden](https://github.com/qybaihe/bothub/issues)**

[Schnellstart](#-schnellstart) · [Plattformen](#-unterstützte-plattformen) · [Funktionen](#-funktionen) · [Entwicklung](#-entwicklung) · [Veröffentlichung](#-veröffentlichung) · [Protokolle](#-protokolldokumentation) · [FAQ](#-faq)

</div>

---

> [!NOTE]
> BotHub ist ein unabhängiger Client und steht in keiner Verbindung zu Meta, xAI, Hark oder OpenAI. Sie melden sich mit Ihren eigenen Konten an, und Ihre Zugangsdaten bleiben auf Ihrem Computer.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: Bots von Muse, Dot, Hark und Grok Bot gruppiert in der Seitenleiste, ein Chat und das Detailfenster des Bots (Beispieldaten)" width="100%">
</picture>
<sub>Screenshot mit fiktiven Beispieldaten.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Alle Agenten, ein Fenster
Bots von Muse, Grok Bot, Hark und Dot nebeneinander, gruppiert in der Seitenleiste – jeder mit eigenem Chat, Detailfenster und eigenen Einstellungen.

</td>
<td width="33%" valign="top">

### 🔐 Getrennte Konten
Jedes Konto läuft in einer eigenen Sitzungspartition oder einem verschlüsselten Speicherplatz für Zugangsdaten, sodass sich mehrere Konten derselben Plattform nie vermischen.

</td>
<td width="33%" valign="top">

### ✅ Zuverlässige Zustellung
Nachrichten zeigen *wird gesendet*, *zugestellt · Antwort folgt*, *keine Antwort* oder *fehlgeschlagen*. Eine Nachricht, die die Plattform angenommen hat, gilt nie als ungesendet – ein erneuter Versuch schickt sie also nicht doppelt.

</td>
</tr>
</table>

---

## ⚡ Schnellstart

Laden Sie die Datei für Ihr System aus der [neuesten Version](https://github.com/qybaihe/bothub/releases/latest) herunter:

| System | Datei |
| :--- | :--- |
| macOS, Apple Silicon | `BotHub-<Version>-arm64.dmg` |
| macOS, Intel | `BotHub-<Version>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<Version>-x64.exe` |

> [!TIP]
> Die Builds sind noch nicht signiert.
> - **macOS**: Ziehen Sie `BotHub.app` in den Ordner „Programme“ und wählen Sie beim ersten Start per Rechtsklick **Öffnen** (oder *Systemeinstellungen → Datenschutz & Sicherheit → Trotzdem öffnen*). Alternativ entfernen Sie das Quarantäne-Attribut mit `xattr -cr /Applications/BotHub.app`.
> - **Windows**: Wenn SmartScreen „Der Computer wurde durch Windows geschützt“ meldet, klicken Sie auf **Weitere Informationen → Trotzdem ausführen**.

Klicken Sie anschließend in der Seitenleiste auf **+**, wählen Sie eine Plattform und melden Sie sich an. Jeder Bot behält sein eigenes Konto.

**Updates**: Unter Windows lädt BotHub neue Versionen im Hintergrund herunter und installiert sie mit einem Klick. Unter macOS meldet BotHub neue Versionen und öffnet die Download-Seite.

## 🤖 Unterstützte Plattformen

| Plattform | Protokoll & Transport | Funktionsumfang |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Isolierte Electron-Partition + natives WebSocket-Gateway | Mehrere Konten, Sammelimport mit E-Mail-Codes, HTTP/SOCKS5-Proxy pro Konto, Cloud-Computer, Ziele, Peers, Arbeitsbereichsdateien, Freigabe von Konnektoren und Diagnose |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf über das Sand-Gateway (`*.sand.x.ai`) | Mehrere Konten, Sand-Cloud-Arbeitsbereich, Live-Streaming, Verlauf der Tool-Aufrufe, Sitzungen, geplante Aufgaben, Erinnerungen und Skills |
| **Hark** (`hark.com`) | WebSocket-RPC + multimodales REST | Anmeldung im Browser (Google oder E-Mail), Live-Streaming mit Antwortabgleich im Hintergrund, Datei- und Bildanhänge, Dokumentkarten, geplante Aufgaben, Erinnerungen und Konnektoren |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + Server-Sent Events (SSE) | OAuth-Anmeldung im Browser oder Import von Access/Refresh Token, verschlüsselte Token-Speicherung, Live-Streaming, Datei-Uploads, Skills, Automatisierungen, Konnektoren und Proxy pro Konto |

## ✨ Funktionen

- **Viele Konten, kein Durcheinander**: Jedes Konto läuft in einer eigenen Electron-Partition `persist:` oder einem verschlüsselten Speicherplatz für Zugangsdaten – so lassen sich mehrere Konten derselben Plattform gleichzeitig nutzen.
- **Verwaltungskonsole**: Eine Vollbildansicht mit Gesamtübersicht, Filter und Suche für Bots, Sammelprüfung der Verbindungen sowie Konten, Tokens und Proxys je Plattform.
- **Umfangreicher Agenten-Chat**: Live-Streaming mit Denkprozess und Tool-Karten, Wiederaufnahme langer Hintergrundaufgaben, Markdown-Tabellen, Syntaxhervorhebung, Dokumentvorschau und Download von Anhängen.
- **Detailfenster für Bots**: Das rechte Fenster zeigt je nach Plattform Sitzungen, geplante Aufgaben, Erinnerungen, Skills, Dateien und Mitglieder des Bots.
- **Lebendige Avatare**: Jeder Bot hat eine animierte `GrokBotMark`-Figur, die dem Mauszeiger folgt und bei der Arbeit reagiert; wählen Sie Form und Farbe oder laden Sie ein Foto hoch.
- **Standardmäßig sicher**: Tokens und Proxy-Passwörter werden mit Electrons `safeStorage` (Schlüsselbund unter macOS) verschlüsselt und mit den Rechten `0600` gespeichert. Keine fest eingebauten Geheimnisse, keine Telemetrie.
- **Oberfläche auf Englisch und Chinesisch**, helles und dunkles Design.

## 🧰 Entwicklung

```bash
npm ci
npm run dev          # Electron + Vite mit Hot Reload
```

| Befehl | Beschreibung |
| :--- | :--- |
| `npm run dev` | Startet den Electron-Hauptprozess, das Preload-Skript und die React-Oberfläche mit Hot Reload |
| `npm run dev:web` | Startet nur die Oberfläche im Browser (ohne Electron, ohne Konten) |
| `npm run typecheck` | Typprüfung für Node- und Web-Ziel |
| `npm test` | Unit-Tests (Vitest) |
| `npm run build` | Typprüfung und Produktions-Build nach `out/` |
| `npm run dist:mac` / `npm run dist:win` | Paketiert macOS `dmg` + `zip` (arm64 + x64) / den Windows-NSIS-Installer nach `release/` |
| `npm run dist:dir` | Unverpackte macOS-arm64-App für einen schnellen Test |

Der README-Screenshot wird aus fiktiven Daten erzeugt: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Veröffentlichung

Bei jedem Push prüft die CI ([`ci.yml`](../../.github/workflows/ci.yml)) Typen, führt Tests aus, baut und paketiert unter macOS und Windows.

1. Erhöhen Sie `version` in `package.json` und mergen Sie nach `main`.
2. Pushen Sie ein Tag `vX.Y.Z`, das zur Version passt.
3. [`release.yml`](../../.github/workflows/release.yml) legt einen Release-Entwurf an, baut macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) und Windows (NSIS `exe`, `latest.yml`), lädt alles hoch und veröffentlicht das Release, sobald alle Dateien vorhanden sind.

Standardmäßig werden die Builds nicht signiert. Signierung und Notarisierung werden aktiv, sobald diese Repository-Secrets gesetzt sind: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) oder `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Projektstruktur

```text
src/
  adapters/        Plattformadapter (Meta Muse, Grok Bot, Hark, Dot) und die gemeinsame PlatformAdapter-Schnittstelle
  main/            Electron-Hauptprozess
    muse/          Muse-Partitionssitzungen, Sammelanmeldung und Proxy-Routing pro Konto
    muse-native/   Client für das native WebSocket-Gateway (Muse-Cloud-Computer und Arbeitsbereich)
    grok/          Sand-Authentifizierung, Connect-RPC-Client und IPC-Handler für Grok Bot
    hark/          WebSocket/REST-Client, Anhang-Upload und IPC-Handler für Hark
    dot/           Client für OpenAI Dot (Orbit/TBO), verschlüsselter Token-Tresor, SSE-Streaming und IPC
  preload/         Typisierte contextBridge-API, bereitgestellt als window.electron
  shared/          IPC-Kanalverträge und Typen für Hauptprozess und Oberfläche
  renderer/        Desktop-Oberfläche mit React + Tailwind + Zustand
    components/    Seitenleiste, Chat, Detailfenster, Plattformfenster, Verwaltungskonsole, GrokBotMark
    store/         Bot-Zustand, Streaming-Abgleich und Persistenz
scripts/screenshot/  README-Screenshot aus fiktiven Beispieldaten
```

## 📚 Protokolldokumentation

Protokolle und API-Notizen zu jeder Plattform finden Sie in [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): OAuth PKCE und Web-Sitzungsauthentifizierung, Orbit-Profile, Raum-SSE und REST, der JSON-RPC-2.0-WebSocket, Pages, Bibliothek und Übertragung von Erinnerungen
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): der WebSocket-Handshake `Noise_XX_25519_ChaChaPoly_SHA256` und mehr als 65 JSON-RPC-Methoden
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): Connect-RPC-Einzel- und Streaming-Aufrufe über HTTP/2, Sand-Authentifizierung, Skills, Erinnerungen, Automatisierungen und die Cloud-Sandbox
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): REST- und NDJSON-Streaming-Endpunkte, Konnektoren, geplante Aufgaben, der Dateibaum der VM und Computer-Sitzungen

## ❓ FAQ

<details>
<summary><b>Ist BotHub eine offizielle App dieser Plattformen?</b></summary>

Nein. BotHub ist ein unabhängiger Client und steht in keiner Verbindung zu Meta, xAI, Hark oder OpenAI. Es nutzt Ihre eigenen Konten auf den jeweiligen Plattformen.

</details>

<details>
<summary><b>Wo werden meine Konten und Tokens gespeichert?</b></summary>

Nur auf Ihrem Computer. Web-Sitzungen liegen in Electron-Partitionen pro Konto; Tokens und Proxy-Passwörter werden mit `safeStorage` (Schlüsselbund unter macOS) verschlüsselt und mit den Rechten `0600` gespeichert. BotHub sendet keine Telemetrie.

</details>

<details>
<summary><b>macOS meldet, dass BotHub nicht geöffnet werden kann. Was tun?</b></summary>

Die Builds sind noch nicht signiert. Klicken Sie mit der rechten Maustaste auf die App und wählen Sie **Öffnen**, oder führen Sie `xattr -cr /Applications/BotHub.app` aus. Siehe [Schnellstart](#-schnellstart).

</details>

<details>
<summary><b>Eine Nachricht zeigt lange „zugestellt · Antwort folgt“. Wird sie bei einem erneuten Versuch doppelt gesendet?</b></summary>

Nein. Sobald die Plattform eine Nachricht angenommen hat, zeigt BotHub sie nie als ungesendet an. Kommt keine Antwort, erscheint *keine Antwort* mit einer Schaltfläche **Erneut senden**, die deutlich macht, dass eine zweite Kopie verschickt wird.

</details>

<details>
<summary><b>Kann jedes Konto einen eigenen Proxy verwenden?</b></summary>

Ja, für Muse- und Dot-Konten (HTTP oder SOCKS5). Lässt sich der Proxy nicht anwenden, blockiert BotHub den Datenverkehr dieses Kontos, statt auf eine direkte Verbindung auszuweichen.

</details>

## 📄 Lizenz

Veröffentlicht unter der [MIT-Lizenz](../../LICENSE).
