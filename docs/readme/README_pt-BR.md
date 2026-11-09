<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · **Português (Brasil)** · [Русский](README_ru.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Reúna todos os seus agentes pessoais e use-os em um só cliente, como no Grok Bot**

**Um app para macOS e Windows que reúne seus bots do Meta Muse, Grok Bot, Hark e Dot em uma única janela, cada um conectado com sua própria conta isolada.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=Vers%C3%A3o&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Plataforma-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-início-rápido)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Licen%C3%A7a-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ Baixar para macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Baixar para Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 Todas as versões](https://github.com/qybaihe/bothub/releases) · [🐛 Relatar um problema](https://github.com/qybaihe/bothub/issues)**

[Início rápido](#-início-rápido) · [Plataformas](#-plataformas-suportadas) · [Recursos](#-recursos) · [Desenvolvimento](#-desenvolvimento) · [Publicação](#-publicação) · [Protocolos](#-documentação-dos-protocolos) · [Perguntas frequentes](#-perguntas-frequentes)

</div>

---

> [!NOTE]
> O BotHub é um cliente independente e não tem vínculo com Meta, xAI, Hark ou OpenAI. Você entra com suas próprias contas, e as credenciais ficam no seu computador.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: bots do Muse, Dot, Hark e Grok Bot agrupados na barra lateral, uma conversa e o painel de detalhes do bot (dados de exemplo)" width="100%">
</picture>
<sub>Captura de tela com dados de exemplo fictícios.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Todos os agentes, uma janela
Bots do Muse, Grok Bot, Hark e Dot lado a lado, agrupados na barra lateral, cada um com sua conversa, painel de detalhes e configurações.

</td>
<td width="33%" valign="top">

### 🔐 Contas isoladas
Cada conta roda em sua própria partição de sessão ou em um espaço criptografado de credenciais, então várias contas da mesma plataforma nunca se misturam.

</td>
<td width="33%" valign="top">

### ✅ Entrega confiável
As mensagens mostram *enviando*, *entregue · respondendo*, *sem resposta* ou *falhou*. Uma mensagem que a plataforma já aceitou nunca aparece como não enviada, então tentar de novo não a publica duas vezes.

</td>
</tr>
</table>

---

## ⚡ Início rápido

Baixe o arquivo para o seu sistema na [versão mais recente](https://github.com/qybaihe/bothub/releases/latest):

| Sistema | Arquivo |
| :--- | :--- |
| macOS, Apple Silicon | `BotHub-<versão>-arm64.dmg` |
| macOS, Intel | `BotHub-<versão>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<versão>-x64.exe` |

> [!TIP]
> As versões ainda não têm assinatura de código.
> - **macOS**: arraste `BotHub.app` para Aplicativos e, na primeira vez, clique com o botão direito e escolha **Abrir** (ou *Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim*). Também é possível remover o atributo de quarentena com `xattr -cr /Applications/BotHub.app`.
> - **Windows**: se o SmartScreen mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

Depois clique em **+** na barra lateral, escolha uma plataforma e entre. Cada bot mantém sua própria conta.

**Atualizações**: no Windows, o BotHub baixa as novas versões em segundo plano e as instala com um clique. No macOS, ele avisa quando sai uma nova versão e abre a página de download.

## 🤖 Plataformas suportadas

| Plataforma | Protocolo e transporte | O que você tem |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Partição isolada do Electron + gateway WebSocket nativo | Várias contas, importação em lote com códigos por e-mail, proxy HTTP/SOCKS5 por conta, computador na nuvem, metas, pares, arquivos do espaço de trabalho, aprovação de conectores e diagnóstico |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf pelo gateway Sand (`*.sand.x.ai`) | Várias contas, espaço de trabalho na nuvem Sand, streaming em tempo real, rastros de chamadas de ferramentas, sessões, tarefas agendadas, memórias e habilidades |
| **Hark** (`hark.com`) | WebSocket RPC + REST multimodal | Login pelo navegador (Google ou e-mail), streaming em tempo real com sincronização de respostas em segundo plano, anexos de arquivos e imagens, cartões de documentos, tarefas agendadas, memórias e conectores |
| **Dot** (`chatgpt.com/dots`) | REST do OpenAI Orbit/TBO + eventos enviados pelo servidor (SSE) | Login OAuth pelo navegador ou importação de Access/Refresh Token, tokens guardados com criptografia, streaming em tempo real, envio de arquivos, habilidades, automações, conectores e proxy por conta |

## ✨ Recursos

- **Várias contas, sem interferência**: cada conta vive em sua própria partição `persist:` do Electron ou em um espaço criptografado de credenciais, então você pode usar várias contas da mesma plataforma ao mesmo tempo.
- **Console de gerenciamento**: uma tela cheia com visão geral, filtro e busca de bots, verificação de conexão em lote e contas, tokens e proxies por plataforma.
- **Chat completo com agentes**: streaming em tempo real com raciocínio e cartões de ferramentas, recuperação de tarefas longas em segundo plano, tabelas Markdown, código destacado, pré-visualização de documentos e download de anexos.
- **Painel de detalhes do bot**: o painel à direita mostra as sessões, tarefas agendadas, memórias, habilidades, arquivos e membros de cada bot, conforme a plataforma.
- **Avatares com vida**: cada bot tem um personagem animado `GrokBotMark` que acompanha o ponteiro e reage enquanto trabalha; escolha forma e cor ou envie uma foto.
- **Seguro por padrão**: tokens e senhas de proxy são criptografados com o `safeStorage` do Electron (Chaves no macOS) e gravados com permissões `0600`. Sem segredos no código e sem telemetria.
- **Interface em inglês e chinês**, temas claro e escuro.

## 🧰 Desenvolvimento

```bash
npm ci
npm run dev          # Electron + Vite com recarga automática
```

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Executa o processo principal do Electron, o preload e a interface React com recarga automática |
| `npm run dev:web` | Executa só a interface no navegador (sem Electron, sem contas) |
| `npm run typecheck` | Verifica os tipos dos alvos Node e web |
| `npm test` | Testes unitários (Vitest) |
| `npm run build` | Verifica os tipos e gera os pacotes de produção em `out/` |
| `npm run dist:mac` / `npm run dist:win` | Empacota macOS `dmg` + `zip` (arm64 + x64) / o instalador NSIS do Windows em `release/` |
| `npm run dist:dir` | App macOS arm64 sem empacotar para um teste rápido |

A captura do README é gerada com dados fictícios: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Publicação

A cada push, a CI ([`ci.yml`](../../.github/workflows/ci.yml)) verifica tipos, roda os testes, compila e empacota no macOS e no Windows.

1. Aumente a `version` no `package.json` e faça merge em `main`.
2. Envie uma tag `vX.Y.Z` igual à versão.
3. O [`release.yml`](../../.github/workflows/release.yml) cria um rascunho de versão, compila macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) e Windows (NSIS `exe`, `latest.yml`), envia tudo e publica a versão quando todos os arquivos estiverem lá.

Por padrão, as versões não são assinadas. A assinatura e a notarização são ativadas quando estes segredos do repositório estão definidos: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) ou `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Estrutura do projeto

```text
src/
  adapters/        Adaptadores de plataforma (Meta Muse, Grok Bot, Hark, Dot) e a interface comum PlatformAdapter
  main/            Processo principal do Electron
    muse/          Sessões em partições do Muse, login em lote e proxy por conta
    muse-native/   Cliente do gateway WebSocket nativo para o computador na nuvem e o espaço de trabalho do Muse
    grok/          Autenticação Sand do Grok Bot, cliente Connect-RPC e manipuladores IPC
    hark/          Cliente WebSocket/REST do Hark, envio de anexos e manipuladores IPC
    dot/           Cliente do OpenAI Dot (Orbit/TBO), cofre de tokens criptografado, streaming SSE e IPC
  preload/         API tipada do contextBridge exposta como window.electron
  shared/          Contratos de canais IPC e tipos compartilhados entre o processo principal e a interface
  renderer/        Interface desktop com React + Tailwind + Zustand
    components/    Barra lateral, conversa, painel de detalhes, painéis por plataforma, console de gerenciamento, GrokBotMark
    store/         Estado dos bots, conciliação do streaming e persistência
scripts/screenshot/  Captura do README com dados de exemplo fictícios
```

## 📚 Documentação dos protocolos

Os protocolos e notas de API de cada plataforma ficam em [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): autenticação OAuth PKCE e de sessão web, perfis Orbit, SSE e REST das salas, o WebSocket JSON-RPC 2.0, Pages, Biblioteca e migração de memórias
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): o handshake WebSocket `Noise_XX_25519_ChaChaPoly_SHA256` e mais de 65 métodos JSON-RPC
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): chamadas Connect-RPC unárias e em streaming sobre HTTP/2, autenticação Sand, habilidades, memórias, automações e o sandbox na nuvem
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): endpoints REST e de streaming NDJSON, conectores, tarefas agendadas, a árvore de arquivos da VM e sessões de computador

## ❓ Perguntas frequentes

<details>
<summary><b>O BotHub é um app oficial dessas plataformas?</b></summary>

Não. O BotHub é um cliente independente e não tem vínculo com Meta, xAI, Hark ou OpenAI. Ele usa suas próprias contas em cada plataforma.

</details>

<details>
<summary><b>Onde ficam minhas contas e tokens?</b></summary>

Só no seu computador. As sessões web ficam em partições do Electron separadas por conta; tokens e senhas de proxy são criptografados com `safeStorage` (Chaves no macOS) e gravados com permissões `0600`. O BotHub não envia telemetria.

</details>

<details>
<summary><b>O macOS diz que o BotHub não pode ser aberto. O que eu faço?</b></summary>

As versões ainda não são assinadas. Clique com o botão direito no app e escolha **Abrir**, ou execute `xattr -cr /Applications/BotHub.app`. Veja o [Início rápido](#-início-rápido).

</details>

<details>
<summary><b>Uma mensagem fica muito tempo em "entregue · respondendo". Tentar de novo vai enviá-la duas vezes?</b></summary>

Não. Depois que a plataforma aceita uma mensagem, o BotHub nunca a mostra como não enviada. Se nenhuma resposta chegar, aparece *sem resposta* com um botão **Enviar de novo**, que deixa claro que uma segunda cópia será publicada.

</details>

<details>
<summary><b>Cada conta pode usar seu próprio proxy?</b></summary>

Sim, nas contas do Muse e do Dot (HTTP ou SOCKS5). Se o proxy não puder ser aplicado, o BotHub bloqueia o tráfego dessa conta em vez de usar uma conexão direta.

</details>

## 📄 Licença

Publicado sob a [licença MIT](../../LICENSE).
