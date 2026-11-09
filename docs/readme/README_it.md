<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · **Italiano** · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Riunisci tutti i tuoi agenti personali e usali in un unico client, proprio come Grok Bot**

**Un'app per macOS e Windows che riunisce i tuoi bot di Meta Muse, Grok Bot, Hark e Dot in un'unica finestra, ciascuno con il proprio account isolato.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Versione&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Piattaforma-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-avvio-rapido)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Licenza-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Scarica per macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Scarica per Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 Tutte le versioni](https://github.com/qybaihe/bothub/releases) · [🐛 Segnala un problema](https://github.com/qybaihe/bothub/issues)**

[Avvio rapido](#-avvio-rapido) · [Piattaforme](#-piattaforme-supportate) · [Funzionalità](#-funzionalità) · [Sviluppo](#-sviluppo) · [Rilascio](#-rilascio) · [Protocolli](#-documentazione-dei-protocolli) · [Domande frequenti](#-domande-frequenti)

</div>

---

> [!NOTE]
> BotHub è un client indipendente e non è affiliato a Meta, xAI, Hark o OpenAI. Accedi con i tuoi account e le credenziali restano sul tuo computer.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: bot di Muse, Dot, Hark e Grok Bot raggruppati nella barra laterale, una conversazione e il pannello dei dettagli del bot (dati di esempio)" width="100%">
</picture>
<sub>Screenshot con dati di esempio fittizi.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Tutti gli agenti, una finestra
I bot di Muse, Grok Bot, Hark e Dot uno accanto all'altro, raggruppati nella barra laterale, ognuno con la sua chat, il pannello dei dettagli e le impostazioni.

</td>
<td width="33%" valign="top">

### 🔐 Account isolati
Ogni account gira nella propria partizione di sessione o in uno spazio cifrato per le credenziali, così più account della stessa piattaforma non si mescolano mai.

</td>
<td width="33%" valign="top">

### ✅ Consegna affidabile
I messaggi mostrano *invio*, *consegnato · in risposta*, *nessuna risposta* o *non riuscito*. Un messaggio già accettato dalla piattaforma non viene mai presentato come non inviato, quindi riprovare non lo pubblica due volte.

</td>
</tr>
</table>

---

## ⚡ Avvio rapido

Scarica il file per il tuo sistema dall'[ultima versione](https://github.com/qybaihe/bothub/releases/latest):

| Sistema | File |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<versione>-arm64.dmg` |
| macOS, Intel | `BotHub-<versione>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<versione>-x64.exe` |

> [!TIP]
> Le build non sono ancora firmate.
> - **macOS**: trascina `BotHub.app` in Applicazioni, poi la prima volta fai clic destro e scegli **Apri** (oppure *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*). Puoi anche rimuovere l'attributo di quarantena con `xattr -cr /Applications/BotHub.app`.
> - **Windows**: se SmartScreen mostra "Windows ha protetto il PC", fai clic su **Ulteriori informazioni → Esegui comunque**.

Poi fai clic su **+** nella barra laterale, scegli una piattaforma e accedi. Ogni bot mantiene il proprio account.

**Aggiornamenti**: su Windows, BotHub scarica le nuove versioni in background e le installa con un clic. Su macOS ti avvisa quando esce una nuova versione e apre la pagina di download.

## 🤖 Piattaforme supportate

| Piattaforma | Protocollo e trasporto | Cosa offre |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Partizione Electron isolata + gateway WebSocket nativo | Più account, importazione in blocco con codici via e-mail, proxy HTTP/SOCKS5 per account, computer nel cloud, obiettivi, peer, file dell'area di lavoro, approvazione dei connettori e diagnostica |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf tramite il gateway Sand (`*.sand.x.ai`) | Più account, area di lavoro cloud Sand, streaming in tempo reale, tracce delle chiamate agli strumenti, sessioni, attività pianificate, memorie e skill |
| **Hark** (`hark.com`) | WebSocket RPC + REST multimodale | Accesso dal browser (Google o e-mail), streaming in tempo reale con sincronizzazione delle risposte in background, allegati di file e immagini, schede documento, attività pianificate, memorie e connettori |
| **Dot** (`chatgpt.com/dots`) | REST OpenAI Orbit/TBO + eventi inviati dal server (SSE) | Accesso OAuth dal browser o importazione di Access/Refresh Token, token salvati cifrati, streaming in tempo reale, caricamento di file, skill, automazioni, connettori e proxy per account |

## ✨ Funzionalità

- **Tanti account, nessuna interferenza**: ogni account vive nella propria partizione Electron `persist:` o in uno spazio cifrato per le credenziali, così puoi usare più account della stessa piattaforma contemporaneamente.
- **Console di gestione**: una vista a schermo intero con panoramica, filtro e ricerca dei bot, verifica delle connessioni in blocco e gestione di account, token e proxy per piattaforma.
- **Chat completa con gli agenti**: streaming in tempo reale con ragionamento e schede degli strumenti, ripresa delle attività lunghe in background, tabelle Markdown, codice evidenziato, anteprima dei documenti e download degli allegati.
- **Pannello dei dettagli del bot**: il pannello a destra mostra sessioni, attività pianificate, memorie, skill, file e membri di ogni bot, a seconda della piattaforma.
- **Avatar vivaci**: ogni bot ha un personaggio animato `GrokBotMark` che segue il puntatore e reagisce mentre lavora; scegli forma e colore o carica una foto.
- **Sicuro di default**: token e password dei proxy sono cifrati con `safeStorage` di Electron (Portachiavi su macOS) e salvati con permessi `0600`. Nessun segreto nel codice, nessuna telemetria.
- **Interfaccia in inglese e cinese**, temi chiaro e scuro.

## 🧰 Sviluppo

```bash
npm ci
npm run dev          # Electron + Vite con ricaricamento a caldo
```

| Comando | Descrizione |
| :--- | :--- |
| `npm run dev` | Avvia il processo principale di Electron, il preload e l'interfaccia React con ricaricamento a caldo |
| `npm run dev:web` | Avvia solo l'interfaccia nel browser (senza Electron né account) |
| `npm run typecheck` | Controlla i tipi dei target Node e web |
| `npm test` | Test unitari (Vitest) |
| `npm run build` | Controlla i tipi e crea i bundle di produzione in `out/` |
| `npm run dist:mac` / `npm run dist:win` | Crea i pacchetti macOS `dmg` + `zip` (arm64 + x64) / l'installer NSIS per Windows in `release/` |
| `npm run dist:dir` | App macOS arm64 non impacchettata per una prova veloce |

Lo screenshot del README è generato da dati fittizi: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Rilascio

A ogni push, la CI ([`ci.yml`](../../.github/workflows/ci.yml)) controlla i tipi, esegue i test, compila e crea i pacchetti su macOS e Windows.

1. Aumenta `version` in `package.json` ed esegui il merge su `main`.
2. Pubblica un tag `vX.Y.Z` corrispondente alla versione.
3. [`release.yml`](../../.github/workflows/release.yml) crea una bozza di release, compila macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) e Windows (NSIS `exe`, `latest.yml`), carica tutto e pubblica la release quando tutti i file sono presenti.

Di default le build non sono firmate. Firma e notarizzazione si attivano quando sono impostati questi secret del repository: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) oppure `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Struttura del progetto

```text
src/
  adapters/        Adattatori di piattaforma (Meta Muse, Grok Bot, Hark, Dot) e l'interfaccia comune PlatformAdapter
  main/            Processo principale di Electron
    muse/          Sessioni in partizioni di Muse, accesso in blocco e proxy per account
    muse-native/   Client del gateway WebSocket nativo per il computer cloud e l'area di lavoro di Muse
    grok/          Autenticazione Sand di Grok Bot, client Connect-RPC e gestori IPC
    hark/          Client WebSocket/REST di Hark, caricamento allegati e gestori IPC
    dot/           Client OpenAI Dot (Orbit/TBO), archivio cifrato dei token, streaming SSE e IPC
  preload/         API contextBridge tipizzata esposta come window.electron
  shared/          Contratti dei canali IPC e tipi condivisi tra processo principale e interfaccia
  renderer/        Interfaccia desktop React + Tailwind + Zustand
    components/    Barra laterale, chat, pannello dei dettagli, pannelli per piattaforma, console di gestione, GrokBotMark
    store/         Stato dei bot, riconciliazione dello streaming e persistenza
scripts/screenshot/  Screenshot del README da dati di esempio fittizi
```

## 📚 Documentazione dei protocolli

I protocolli e le note sulle API di ogni piattaforma si trovano in [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): autenticazione OAuth PKCE e di sessione web, profili Orbit, SSE e REST delle stanze, il WebSocket JSON-RPC 2.0, Pages, Libreria e migrazione delle memorie
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): l'handshake WebSocket `Noise_XX_25519_ChaChaPoly_SHA256` e oltre 65 metodi JSON-RPC
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): chiamate Connect-RPC unarie e in streaming su HTTP/2, autenticazione Sand, skill, memorie, automazioni e la sandbox nel cloud
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): endpoint REST e di streaming NDJSON, connettori, attività pianificate, l'albero dei file della VM e sessioni del computer

## ❓ Domande frequenti

<details>
<summary><b>BotHub è un'app ufficiale di queste piattaforme?</b></summary>

No. BotHub è un client indipendente e non è affiliato a Meta, xAI, Hark o OpenAI. Usa i tuoi account su ciascuna piattaforma.

</details>

<details>
<summary><b>Dove vengono salvati account e token?</b></summary>

Solo sul tuo computer. Le sessioni web stanno in partizioni Electron separate per account; token e password dei proxy sono cifrati con `safeStorage` (Portachiavi su macOS) e salvati con permessi `0600`. BotHub non invia telemetria.

</details>

<details>
<summary><b>macOS dice che BotHub non può essere aperto. Cosa faccio?</b></summary>

Le build non sono ancora firmate. Fai clic destro sull'app e scegli **Apri**, oppure esegui `xattr -cr /Applications/BotHub.app`. Vedi [Avvio rapido](#-avvio-rapido).

</details>

<details>
<summary><b>Un messaggio resta a lungo su "consegnato · in risposta". Riprovare lo invierà due volte?</b></summary>

No. Una volta che la piattaforma ha accettato un messaggio, BotHub non lo presenta mai come non inviato. Se la risposta non arriva, mostra *nessuna risposta* con un pulsante **Invia di nuovo** che indica chiaramente l'invio di una seconda copia.

</details>

<details>
<summary><b>Ogni account può usare un proprio proxy?</b></summary>

Sì, per gli account Muse e Dot (HTTP o SOCKS5). Se il proxy non può essere applicato, BotHub blocca il traffico di quell'account invece di passare a una connessione diretta.

</details>

## 📄 Licenza

Distribuito con [licenza MIT](../../LICENSE).
