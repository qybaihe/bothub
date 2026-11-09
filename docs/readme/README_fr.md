<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · **Français** · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Réunissez tous vos agents personnels et utilisez-les dans un seul client, comme avec Grok Bot**

**Une application macOS et Windows qui rassemble vos bots Meta Muse, Grok Bot, Hark et Dot dans une seule fenêtre, chacun connecté avec son propre compte isolé.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Version&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Plateforme-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-démarrage-rapide)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Licence-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Télécharger pour macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Télécharger pour Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 Toutes les versions](https://github.com/qybaihe/bothub/releases) · [🐛 Signaler un problème](https://github.com/qybaihe/bothub/issues)**

[Démarrage rapide](#-démarrage-rapide) · [Plateformes](#-plateformes-prises-en-charge) · [Fonctionnalités](#-fonctionnalités) · [Développement](#-développement) · [Publication](#-publication) · [Protocoles](#-documentation-des-protocoles) · [FAQ](#-faq)

</div>

---

> [!NOTE]
> BotHub est un client indépendant, sans lien avec Meta, xAI, Hark ou OpenAI. Vous vous connectez avec vos propres comptes, et vos identifiants restent sur votre ordinateur.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub : bots Muse, Dot, Hark et Grok Bot regroupés dans la barre latérale, une conversation et le panneau de détails du bot (données d'exemple)" width="100%">
</picture>
<sub>Capture d'écran avec des données d'exemple fictives.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Tous vos agents, une seule fenêtre
Les bots Muse, Grok Bot, Hark et Dot côte à côte, regroupés dans la barre latérale, chacun avec sa conversation, son panneau de détails et ses réglages.

</td>
<td width="33%" valign="top">

### 🔐 Comptes isolés
Chaque compte fonctionne dans sa propre partition de session ou son emplacement d'identifiants chiffré : plusieurs comptes d'une même plateforme ne se mélangent jamais.

</td>
<td width="33%" valign="top">

### ✅ Envoi fiable
Les messages affichent *envoi*, *remis · réponse en cours*, *pas de réponse* ou *échec*. Un message accepté par la plateforme n'est jamais présenté comme non envoyé : un nouvel essai ne le publie pas deux fois.

</td>
</tr>
</table>

---

## ⚡ Démarrage rapide

Téléchargez le fichier correspondant à votre système depuis la [dernière version](https://github.com/qybaihe/bothub/releases/latest) :

| Système | Fichier |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<version>-arm64.dmg` |
| macOS, Intel | `BotHub-<version>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<version>-x64.exe` |

> [!TIP]
> Les versions ne sont pas encore signées.
> - **macOS** : glissez `BotHub.app` dans Applications, puis faites un clic droit et choisissez **Ouvrir** la première fois (ou *Réglages Système → Confidentialité et sécurité → Ouvrir quand même*). Vous pouvez aussi retirer l'attribut de quarantaine avec `xattr -cr /Applications/BotHub.app`.
> - **Windows** : si SmartScreen affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires → Exécuter quand même**.

Cliquez ensuite sur **+** dans la barre latérale, choisissez une plateforme et connectez-vous. Chaque bot garde son propre compte.

**Mises à jour** : sous Windows, BotHub télécharge les nouvelles versions en arrière-plan et les installe en un clic. Sous macOS, il vous prévient quand une nouvelle version sort et ouvre la page de téléchargement.

## 🤖 Plateformes prises en charge

| Plateforme | Protocole et transport | Ce que vous obtenez |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Partition Electron isolée + passerelle WebSocket native | Plusieurs comptes, import groupé avec codes par e-mail, proxy HTTP/SOCKS5 par compte, ordinateur dans le cloud, objectifs, pairs, fichiers de l'espace de travail, validation des connecteurs et diagnostics |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf via la passerelle Sand (`*.sand.x.ai`) | Plusieurs comptes, espace de travail cloud Sand, streaming en direct, traces des appels d'outils, sessions, tâches planifiées, mémoires et compétences |
| **Hark** (`hark.com`) | WebSocket RPC + REST multimodal | Connexion dans le navigateur (Google ou e-mail), streaming en direct avec synchronisation des réponses en arrière-plan, pièces jointes (fichiers et images), cartes de documents, tâches planifiées, mémoires et connecteurs |
| **Dot** (`chatgpt.com/dots`) | REST OpenAI Orbit/TBO + événements envoyés par le serveur (SSE) | Connexion OAuth dans le navigateur ou import d'Access/Refresh Token, stockage chiffré des jetons, streaming en direct, envoi de fichiers, compétences, automatisations, connecteurs et proxy par compte |

## ✨ Fonctionnalités

- **Plusieurs comptes, aucune interférence** : chaque compte vit dans sa propre partition Electron `persist:` ou son emplacement d'identifiants chiffré : vous pouvez utiliser plusieurs comptes d'une même plateforme en même temps.
- **Console de gestion** : une vue plein écran avec vue d'ensemble, filtre et recherche de bots, vérification groupée des connexions, et gestion des comptes, jetons et proxys par plateforme.
- **Conversations riches** : streaming en direct avec raisonnement et cartes d'outils, reprise des longues tâches en arrière-plan, tableaux Markdown, code coloré, aperçu de documents et téléchargement des pièces jointes.
- **Panneau de détails du bot** : le panneau de droite affiche les sessions, tâches planifiées, mémoires, compétences, fichiers et membres de chaque bot, selon la plateforme.
- **Avatars vivants** : chaque bot a un personnage animé `GrokBotMark` qui suit le pointeur et réagit pendant qu'il travaille ; choisissez une forme et une couleur, ou importez une photo.
- **Sécurisé par défaut** : les jetons et mots de passe de proxy sont chiffrés avec `safeStorage` d'Electron (Trousseau sur macOS) et enregistrés avec les permissions `0600`. Aucun secret dans le code, aucune télémétrie.
- **Interface en anglais et en chinois**, thèmes clair et sombre.

## 🧰 Développement

```bash
npm ci
npm run dev          # Electron + Vite avec rechargement à chaud
```

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Lance le processus principal Electron, le preload et l'interface React avec rechargement à chaud |
| `npm run dev:web` | Lance uniquement l'interface dans un navigateur (sans Electron ni comptes) |
| `npm run typecheck` | Vérifie les types des cibles Node et web |
| `npm test` | Tests unitaires (Vitest) |
| `npm run build` | Vérifie les types et compile les bundles de production dans `out/` |
| `npm run dist:mac` / `npm run dist:win` | Empaquette macOS `dmg` + `zip` (arm64 + x64) / l'installeur NSIS Windows dans `release/` |
| `npm run dist:dir` | Application macOS arm64 non empaquetée pour un test rapide |

La capture du README est générée à partir de données fictives : `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Publication

À chaque push, la CI ([`ci.yml`](../../.github/workflows/ci.yml)) vérifie les types, lance les tests, compile et empaquette sous macOS et Windows.

1. Augmentez `version` dans `package.json` et fusionnez dans `main`.
2. Poussez un tag `vX.Y.Z` correspondant à la version.
3. [`release.yml`](../../.github/workflows/release.yml) crée une version brouillon, compile macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) et Windows (NSIS `exe`, `latest.yml`), envoie tous les fichiers et publie la version une fois qu'ils sont tous présents.

Par défaut, les versions ne sont pas signées. La signature et la notarisation s'activent quand ces secrets du dépôt sont définis : `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) ou `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Structure du projet

```text
src/
  adapters/        Adaptateurs de plateforme (Meta Muse, Grok Bot, Hark, Dot) et l'interface commune PlatformAdapter
  main/            Processus principal Electron
    muse/          Sessions en partitions Muse, connexion groupée et proxy par compte
    muse-native/   Client de la passerelle WebSocket native pour l'ordinateur cloud et l'espace de travail Muse
    grok/          Authentification Sand de Grok Bot, client Connect-RPC et gestionnaires IPC
    hark/          Client WebSocket/REST Hark, envoi des pièces jointes et gestionnaires IPC
    dot/           Client OpenAI Dot (Orbit/TBO), coffre de jetons chiffré, streaming SSE et IPC
  preload/         API contextBridge typée exposée sous window.electron
  shared/          Contrats des canaux IPC et types partagés entre le processus principal et l'interface
  renderer/        Interface de bureau React + Tailwind + Zustand
    components/    Barre latérale, conversation, panneau de détails, panneaux par plateforme, console de gestion, GrokBotMark
    store/         État des bots, réconciliation du streaming et persistance
scripts/screenshot/  Capture du README à partir de données fictives
```

## 📚 Documentation des protocoles

Les protocoles et notes d'API de chaque plateforme se trouvent dans [`docs/`](../README.md) :

- **OpenAI Dot** (`chatgpt.com/dots`) : [`docs/dot/protocol.md`](../dot/protocol.md) : authentification OAuth PKCE et session web, profils Orbit, SSE et REST des salons, WebSocket JSON-RPC 2.0, Pages, Bibliothèque et migration des mémoires
- **Meta Muse** (`muse.ai`) : [`docs/museai/protocol.md`](../museai/protocol.md) : la poignée de main WebSocket `Noise_XX_25519_ChaChaPoly_SHA256` et plus de 65 méthodes JSON-RPC
- **xAI Grok Bot** (`grok.com`) : [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md) : appels Connect-RPC unaires et en streaming sur HTTP/2, authentification Sand, compétences, mémoires, automatisations et sandbox cloud
- **Hark** (`hark.com`) : [`docs/hark/protocol.md`](../hark/protocol.md) : endpoints REST et streaming NDJSON, connecteurs, tâches planifiées, arborescence de fichiers de la VM et sessions d'ordinateur

## ❓ FAQ

<details>
<summary><b>BotHub est-il une application officielle de ces plateformes ?</b></summary>

Non. BotHub est un client indépendant, sans lien avec Meta, xAI, Hark ou OpenAI. Il utilise vos propres comptes sur chaque plateforme.

</details>

<details>
<summary><b>Où sont stockés mes comptes et jetons ?</b></summary>

Uniquement sur votre ordinateur. Les sessions web sont dans des partitions Electron propres à chaque compte ; les jetons et mots de passe de proxy sont chiffrés avec `safeStorage` (Trousseau sur macOS) et enregistrés avec les permissions `0600`. BotHub n'envoie aucune télémétrie.

</details>

<details>
<summary><b>macOS indique que BotHub ne peut pas être ouvert. Que faire ?</b></summary>

Les versions ne sont pas encore signées. Faites un clic droit sur l'application et choisissez **Ouvrir**, ou lancez `xattr -cr /Applications/BotHub.app`. Voir le [Démarrage rapide](#-démarrage-rapide).

</details>

<details>
<summary><b>Un message reste longtemps sur « remis · réponse en cours ». Réessayer l'enverra-t-il deux fois ?</b></summary>

Non. Dès que la plateforme a accepté un message, BotHub ne le présente jamais comme non envoyé. Si aucune réponse n'arrive, il affiche *pas de réponse* avec un bouton **Renvoyer** qui indique clairement qu'une seconde copie sera publiée.

</details>

<details>
<summary><b>Chaque compte peut-il utiliser son propre proxy ?</b></summary>

Oui, pour les comptes Muse et Dot (HTTP ou SOCKS5). Si le proxy ne peut pas être appliqué, BotHub bloque le trafic de ce compte au lieu de passer en connexion directe.

</details>

## 📄 Licence

Publié sous [licence MIT](../../LICENSE).
