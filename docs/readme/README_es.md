<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · **Español** · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Reúne todos tus agentes personales y úsalos en un solo cliente, como en Grok Bot**

**Una app para macOS y Windows que reúne tus bots de Meta Muse, Grok Bot, Hark y Dot en una sola ventana, cada uno con su propia cuenta aislada.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Versi%C3%B3n&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Plataforma-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-inicio-rápido)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Licencia-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Descargar para macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Descargar para Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 Todas las versiones](https://github.com/qybaihe/bothub/releases) · [🐛 Informar de un problema](https://github.com/qybaihe/bothub/issues)**

[Inicio rápido](#-inicio-rápido) · [Plataformas](#-plataformas-compatibles) · [Funciones](#-funciones) · [Desarrollo](#-desarrollo) · [Publicación](#-publicación) · [Protocolos](#-documentación-de-protocolos) · [Preguntas frecuentes](#-preguntas-frecuentes)

</div>

---

> [!NOTE]
> BotHub es un cliente independiente y no está afiliado a Meta, xAI, Hark ni OpenAI. Inicias sesión con tus propias cuentas y las credenciales se quedan en tu ordenador.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: bots de Muse, Dot, Hark y Grok Bot agrupados en la barra lateral, una conversación y el panel de detalles del bot (datos de ejemplo)" width="100%">
</picture>
<sub>Captura con datos de ejemplo ficticios.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Todos tus agentes, una ventana
Bots de Muse, Grok Bot, Hark y Dot uno al lado del otro, agrupados en la barra lateral, cada uno con su chat, panel de detalles y ajustes.

</td>
<td width="33%" valign="top">

### 🔐 Cuentas aisladas
Cada cuenta funciona en su propia partición de sesión o en un espacio cifrado de credenciales, así que varias cuentas de la misma plataforma nunca se mezclan.

</td>
<td width="33%" valign="top">

### ✅ Entrega fiable
Los mensajes muestran *enviando*, *entregado · respondiendo*, *sin respuesta* o *error*. Un mensaje que la plataforma ya aceptó nunca se presenta como no enviado, así que reintentar no lo publica dos veces.

</td>
</tr>
</table>

---

## ⚡ Inicio rápido

Descarga el archivo para tu sistema desde la [última versión](https://github.com/qybaihe/bothub/releases/latest):

| Sistema | Archivo |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<versión>-arm64.dmg` |
| macOS, Intel | `BotHub-<versión>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<versión>-x64.exe` |

> [!TIP]
> Las compilaciones aún no están firmadas.
> - **macOS**: arrastra `BotHub.app` a Aplicaciones y, la primera vez, haz clic derecho y elige **Abrir** (o *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*). También puedes quitar la marca de cuarentena con `xattr -cr /Applications/BotHub.app`.
> - **Windows**: si SmartScreen muestra "Windows protegió su PC", haz clic en **Más información → Ejecutar de todas formas**.

Después haz clic en **+** en la barra lateral, elige una plataforma e inicia sesión. Cada bot conserva su propia cuenta.

**Actualizaciones**: en Windows, BotHub descarga las nuevas versiones en segundo plano y las instala con un clic. En macOS, te avisa cuando hay una versión nueva y abre la página de descarga.

## 🤖 Plataformas compatibles

| Plataforma | Protocolo y transporte | Qué incluye |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Partición de Electron aislada + gateway WebSocket nativo | Varias cuentas, importación por lotes con códigos de correo, proxy HTTP/SOCKS5 por cuenta, ordenador en la nube, objetivos, pares, archivos del espacio de trabajo, aprobación de conectores y diagnóstico |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf a través del gateway Sand (`*.sand.x.ai`) | Varias cuentas, espacio de trabajo en la nube Sand, streaming en tiempo real, trazas de llamadas a herramientas, sesiones, tareas programadas, memorias y habilidades |
| **Hark** (`hark.com`) | WebSocket RPC + REST multimodal | Inicio de sesión en el navegador (Google o correo), streaming en tiempo real con sincronización de respuestas en segundo plano, adjuntos de archivos e imágenes, tarjetas de documentos, tareas programadas, memorias y conectores |
| **Dot** (`chatgpt.com/dots`) | REST de OpenAI Orbit/TBO + eventos enviados por el servidor (SSE) | Inicio de sesión OAuth en el navegador o importación de Access/Refresh Token, tokens guardados cifrados, streaming en tiempo real, subida de archivos, habilidades, automatizaciones, conectores y proxy por cuenta |

## ✨ Funciones

- **Muchas cuentas sin interferencias**: cada cuenta vive en su propia partición `persist:` de Electron o en un espacio cifrado de credenciales, así que puedes usar varias cuentas de la misma plataforma a la vez.
- **Consola de gestión**: una vista a pantalla completa con resumen general, filtro y búsqueda de bots, comprobación de conexión por lotes, y cuentas, tokens y proxies por plataforma.
- **Chat de agentes completo**: streaming en tiempo real con razonamiento y tarjetas de herramientas, recuperación de tareas largas en segundo plano, tablas Markdown, código resaltado, vista previa de documentos y descarga de adjuntos.
- **Panel de detalles del bot**: el panel derecho muestra las sesiones, tareas programadas, memorias, habilidades, archivos y miembros de cada bot, según la plataforma.
- **Avatares con vida**: cada bot tiene un personaje animado `GrokBotMark` que sigue el puntero y reacciona mientras trabaja; elige forma y color o sube una foto.
- **Seguro por defecto**: los tokens y las contraseñas de proxy se cifran con `safeStorage` de Electron (Llavero en macOS) y se guardan con permisos `0600`. Sin secretos en el código y sin telemetría.
- **Interfaz en inglés y chino**, temas claro y oscuro.

## 🧰 Desarrollo

```bash
npm ci
npm run dev          # Electron + Vite con recarga en caliente
```

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Ejecuta el proceso principal de Electron, el preload y la interfaz React con recarga en caliente |
| `npm run dev:web` | Ejecuta solo la interfaz en un navegador (sin Electron ni cuentas) |
| `npm run typecheck` | Comprueba los tipos de los destinos Node y web |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run build` | Comprueba tipos y compila los paquetes de producción en `out/` |
| `npm run dist:mac` / `npm run dist:win` | Empaqueta macOS `dmg` + `zip` (arm64 + x64) / el instalador NSIS de Windows en `release/` |
| `npm run dist:dir` | App de macOS arm64 sin empaquetar para una prueba rápida |

La captura del README se genera con datos ficticios: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Publicación

En cada push, CI ([`ci.yml`](../../.github/workflows/ci.yml)) comprueba tipos, ejecuta pruebas, compila y empaqueta en macOS y Windows.

1. Sube la `version` en `package.json` y fusiona en `main`.
2. Publica una etiqueta `vX.Y.Z` que coincida con la versión.
3. [`release.yml`](../../.github/workflows/release.yml) crea un borrador de versión, compila macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) y Windows (NSIS `exe`, `latest.yml`), sube todo y publica la versión cuando están todos los archivos.

Por defecto las compilaciones no se firman. La firma y la notarización se activan al configurar estos secretos del repositorio: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) o `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Estructura del proyecto

```text
src/
  adapters/        Adaptadores de plataforma (Meta Muse, Grok Bot, Hark, Dot) y la interfaz común PlatformAdapter
  main/            Proceso principal de Electron
    muse/          Sesiones en particiones de Muse, inicio de sesión por lotes y proxy por cuenta
    muse-native/   Cliente del gateway WebSocket nativo para el ordenador en la nube y el espacio de trabajo de Muse
    grok/          Autenticación Sand de Grok Bot, cliente Connect-RPC y manejadores IPC
    hark/          Cliente WebSocket/REST de Hark, subida de adjuntos y manejadores IPC
    dot/           Cliente de OpenAI Dot (Orbit/TBO), almacén cifrado de tokens, streaming SSE e IPC
  preload/         API tipada de contextBridge expuesta como window.electron
  shared/          Contratos de canales IPC y tipos compartidos entre el proceso principal y la interfaz
  renderer/        Interfaz de escritorio con React + Tailwind + Zustand
    components/    Barra lateral, chat, panel de detalles, paneles por plataforma, consola de gestión, GrokBotMark
    store/         Estado de los bots, conciliación del streaming y persistencia
scripts/screenshot/  Captura del README con datos de ejemplo ficticios
```

## 📚 Documentación de protocolos

Los protocolos y notas de API de cada plataforma están en [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): autenticación OAuth PKCE y de sesión web, perfiles Orbit, SSE y REST de salas, el WebSocket JSON-RPC 2.0, Pages, Biblioteca y migración de memorias
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): el handshake WebSocket `Noise_XX_25519_ChaChaPoly_SHA256` y más de 65 métodos JSON-RPC
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): llamadas Connect-RPC unarias y en streaming sobre HTTP/2, autenticación Sand, habilidades, memorias, automatizaciones y el sandbox en la nube
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): endpoints REST y de streaming NDJSON, conectores, tareas programadas, el árbol de archivos de la VM y sesiones de ordenador

## ❓ Preguntas frecuentes

<details>
<summary><b>¿BotHub es una app oficial de estas plataformas?</b></summary>

No. BotHub es un cliente independiente y no está afiliado a Meta, xAI, Hark ni OpenAI. Usa tus propias cuentas en cada plataforma.

</details>

<details>
<summary><b>¿Dónde se guardan mis cuentas y tokens?</b></summary>

Solo en tu ordenador. Las sesiones web viven en particiones de Electron por cuenta; los tokens y las contraseñas de proxy se cifran con `safeStorage` (Llavero en macOS) y se guardan con permisos `0600`. BotHub no envía telemetría.

</details>

<details>
<summary><b>macOS dice que no se puede abrir BotHub. ¿Qué hago?</b></summary>

Las compilaciones aún no están firmadas. Haz clic derecho en la app y elige **Abrir**, o ejecuta `xattr -cr /Applications/BotHub.app`. Consulta el [Inicio rápido](#-inicio-rápido).

</details>

<details>
<summary><b>Un mensaje lleva mucho rato en "entregado · respondiendo". ¿Reintentar lo enviará dos veces?</b></summary>

No. Cuando la plataforma acepta un mensaje, BotHub nunca lo presenta como no enviado. Si no llega respuesta, muestra *sin respuesta* con un botón **Enviar de nuevo** que deja claro que publicará una segunda copia.

</details>

<details>
<summary><b>¿Cada cuenta puede usar su propio proxy?</b></summary>

Sí, en las cuentas de Muse y Dot (HTTP o SOCKS5). Si no se puede aplicar el proxy, BotHub bloquea el tráfico de esa cuenta en lugar de conectarse directamente.

</details>

## 📄 Licencia

Publicado bajo la [licencia MIT](../../LICENSE).
