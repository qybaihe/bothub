<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · **한국어** · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **흩어진 개인 에이전트를 한데 모아, 하나의 클라이언트에서 Grok Bot처럼 사용하세요**

**Meta Muse, Grok Bot, Hark, Dot의 봇을 하나의 창에 모아 주는 macOS·Windows 앱입니다. 봇마다 서로 분리된 계정으로 로그인합니다.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=%EC%B5%9C%EC%8B%A0%20%EB%B2%84%EC%A0%84&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/%ED%94%8C%EB%9E%AB%ED%8F%BC-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-빠른-시작)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ macOS용 다운로드](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Windows용 다운로드](https://github.com/qybaihe/bothub/releases/latest) · [📦 전체 릴리스](https://github.com/qybaihe/bothub/releases) · [🐛 문제 신고](https://github.com/qybaihe/bothub/issues)**

[빠른 시작](#-빠른-시작) · [지원 플랫폼](#-지원-플랫폼) · [주요 기능](#-주요-기능) · [개발](#-개발) · [릴리스](#-릴리스) · [프로토콜 문서](#-프로토콜-문서) · [FAQ](#-자주-묻는-질문)

</div>

---

> [!NOTE]
> BotHub는 독립적으로 개발된 클라이언트이며 Meta, xAI, Hark, OpenAI와 관련이 없습니다. 본인의 계정으로 로그인하며, 인증 정보는 사용자의 컴퓨터에만 저장됩니다.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: 사이드바에 그룹별로 정리된 Muse, Dot, Hark, Grok Bot 봇과 대화 화면, 봇 상세 패널(샘플 데이터)" width="100%">
</picture>
<sub>가상의 샘플 데이터로 찍은 스크린샷입니다.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 모든 에이전트를 한 창에서
Muse, Grok Bot, Hark, Dot 봇이 사이드바에 그룹별로 나란히 놓이고, 봇마다 대화·상세 패널·설정이 따로 있습니다.

</td>
<td width="33%" valign="top">

### 🔐 계정 분리
각 계정은 자체 세션 파티션이나 암호화된 인증 정보 슬롯에서 실행되므로, 같은 플랫폼의 여러 계정이 섞이지 않습니다.

</td>
<td width="33%" valign="top">

### ✅ 확실한 전송
메시지에는 *전송 중*, *전달됨 · 답변 중*, *답변 없음*, *실패* 상태가 표시됩니다. 플랫폼이 받은 메시지를 미전송으로 다루지 않으므로 다시 시도해도 두 번 전송되지 않습니다.

</td>
</tr>
</table>

---

## ⚡ 빠른 시작

[최신 릴리스](https://github.com/qybaihe/bothub/releases/latest)에서 사용 중인 운영체제에 맞는 파일을 내려받으세요.

| 운영체제 | 파일 |
| :--- | :--- |
| macOS, Apple 실리콘 | `BotHub-<버전>-arm64.dmg` |
| macOS, Intel | `BotHub-<버전>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<버전>-x64.exe` |

> [!TIP]
> 아직 코드 서명이 되지 않은 빌드입니다.
> - **macOS**: `BotHub.app`을 응용 프로그램 폴더로 옮긴 뒤, 처음 실행할 때 마우스 오른쪽 버튼을 눌러 **열기**를 선택하세요(또는 *시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기*). `xattr -cr /Applications/BotHub.app`으로 격리 속성을 지울 수도 있습니다.
> - **Windows**: SmartScreen에 "Windows의 PC 보호"가 표시되면 **추가 정보 → 실행**을 누르세요.

설치 후 사이드바의 **+**를 눌러 플랫폼을 고르고 로그인하면 됩니다. 봇마다 각자의 계정을 사용합니다.

**업데이트**: Windows에서는 새 버전을 백그라운드로 내려받아 클릭 한 번으로 설치합니다. macOS에서는 새 버전이 나오면 알려 주고 다운로드 페이지를 엽니다.

## 🤖 지원 플랫폼

| 플랫폼 | 프로토콜 및 전송 방식 | 제공 기능 |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | 분리된 Electron 파티션 + 네이티브 WebSocket 게이트웨이 | 여러 계정, 이메일 인증 코드로 일괄 가져오기, 계정별 HTTP/SOCKS5 프록시, 클라우드 컴퓨터, 목표, 피어, 작업 공간 파일, 커넥터 승인 및 진단 |
| **Grok Bot** (`grok.com`) | Sand 게이트웨이(`*.sand.x.ai`)를 통한 Connect-RPC / Protobuf | 여러 계정, Sand 클라우드 작업 공간, 실시간 스트리밍, 도구 호출 기록, 세션, 예약 작업, 메모리, 스킬 |
| **Hark** (`hark.com`) | WebSocket RPC + 멀티모달 REST | 브라우저 로그인(Google 또는 이메일), 실시간 스트리밍과 백그라운드 답변 동기화, 파일·이미지 첨부, 문서 카드, 예약 작업, 메모리, 커넥터 |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + 서버 전송 이벤트(SSE) | 브라우저 OAuth 로그인 또는 Access/Refresh Token 가져오기, 토큰 암호화 저장, 실시간 스트리밍, 파일 업로드, 스킬, 자동화, 커넥터, 계정별 프록시 |

## ✨ 주요 기능

- **계정이 많아도 섞이지 않음**: 각 계정은 독립된 Electron `persist:` 파티션이나 암호화된 인증 정보 슬롯에서 실행되어, 같은 플랫폼의 여러 계정을 동시에 쓸 수 있습니다.
- **관리 콘솔**: 전체 현황, 봇 필터와 검색, 일괄 연결 확인, 플랫폼별 계정·토큰·프록시 관리를 한 화면에서 제공합니다.
- **풍부한 에이전트 대화**: 생각 과정과 도구 카드를 포함한 실시간 스트리밍, 오래 걸리는 백그라운드 작업 복구, Markdown 표, 코드 하이라이트, 문서 미리보기, 첨부 파일 다운로드.
- **봇 상세 패널**: 오른쪽 패널에서 플랫폼에 따라 봇의 세션, 예약 작업, 메모리, 스킬, 파일, 멤버를 보여 줍니다.
- **움직이는 아바타**: 모든 봇에는 마우스 포인터를 따라보고 작업 중에 반응하는 `GrokBotMark` 캐릭터가 있습니다. 모양과 색을 바꾸거나 사진을 올릴 수 있습니다.
- **기본부터 안전하게**: 토큰과 프록시 비밀번호는 Electron `safeStorage`(macOS에서는 키체인)로 암호화되어 `0600` 권한으로 저장됩니다. 하드코딩된 비밀 값도, 원격 측정도 없습니다.
- **영어·중국어 UI**, 라이트·다크 테마 지원.

## 🧰 개발

```bash
npm ci
npm run dev          # Electron + Vite, 핫 리로드
```

| 명령어 | 설명 |
| :--- | :--- |
| `npm run dev` | Electron 메인 프로세스, preload, React 화면을 핫 리로드로 실행 |
| `npm run dev:web` | 화면만 브라우저에서 실행(Electron 없음, 계정 없음) |
| `npm run typecheck` | Node와 웹 대상 타입 검사 |
| `npm test` | 단위 테스트(Vitest) |
| `npm run build` | 타입 검사 후 `out/`에 프로덕션 빌드 |
| `npm run dist:mac` / `npm run dist:win` | macOS `dmg` + `zip`(arm64 + x64) / Windows NSIS 설치 파일을 `release/`에 패키징 |
| `npm run dist:dir` | 간단한 동작 확인용 macOS arm64 앱(패키징 전) |

README 스크린샷은 가상의 데이터로 생성합니다: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 릴리스

푸시할 때마다 CI([`ci.yml`](../../.github/workflows/ci.yml))가 macOS와 Windows에서 타입 검사, 테스트, 빌드, 패키징을 실행합니다.

1. `package.json`의 `version`을 올리고 `main`에 병합합니다.
2. 버전과 같은 태그 `vX.Y.Z`를 푸시합니다.
3. [`release.yml`](../../.github/workflows/release.yml)이 초안 릴리스를 만들고 macOS(arm64 + x64 `dmg`/`zip`, `latest-mac.yml`)와 Windows(NSIS `exe`, `latest.yml`)를 빌드해 업로드한 뒤, 모든 파일이 갖춰지면 릴리스를 공개합니다.

기본적으로 서명하지 않습니다. 다음 저장소 시크릿을 설정하면 서명과 공증이 켜집니다: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`(macOS) 또는 `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`(Windows).

## 📁 프로젝트 구조

```text
src/
  adapters/        플랫폼 어댑터(Meta Muse, Grok Bot, Hark, Dot)와 공통 PlatformAdapter 인터페이스
  main/            Electron 메인 프로세스
    muse/          Muse 파티션 세션, 일괄 로그인, 계정별 프록시 라우팅
    muse-native/   Muse 클라우드 컴퓨터·작업 공간 호출용 네이티브 WebSocket 게이트웨이 클라이언트
    grok/          Grok Bot Sand 인증, Connect-RPC 클라이언트, IPC 핸들러
    hark/          Hark WebSocket/REST 클라이언트, 첨부 파일 업로더, IPC 핸들러
    dot/           OpenAI Dot(Orbit/TBO) 클라이언트, 암호화 토큰 보관소, SSE 스트리밍, IPC
  preload/         window.electron으로 노출되는 타입 지정 contextBridge API
  shared/          메인과 렌더러가 공유하는 IPC 채널 규약과 타입
  renderer/        React + Tailwind + Zustand 데스크톱 UI
    components/    사이드바, 대화, 상세 패널, 플랫폼별 패널, 관리 콘솔, GrokBotMark
    store/         봇 상태, 스트리밍 메시지 병합, 로컬 저장
scripts/screenshot/  가상의 샘플 데이터로 README 스크린샷 생성
```

## 📚 프로토콜 문서

각 플랫폼의 통신 프로토콜과 API 메모는 [`docs/`](../README.md)에 있습니다.

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): OAuth PKCE와 웹 세션 인증, Orbit 프로필, 룸 SSE와 REST, JSON-RPC 2.0 WebSocket, Pages, 라이브러리, 메모리 이전
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): `Noise_XX_25519_ChaChaPoly_SHA256` 암호화 WebSocket 핸드셰이크와 65개 이상의 JSON-RPC 메서드
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): HTTP/2 기반 Connect-RPC 단일·스트리밍 호출, Sand 인증, 스킬, 메모리, 자동화, 클라우드 샌드박스
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): REST 및 NDJSON 스트리밍 엔드포인트, 커넥터, 예약 작업, VM 파일 트리, 컴퓨터 세션

## ❓ 자주 묻는 질문

<details>
<summary><b>BotHub는 이 플랫폼들의 공식 앱인가요?</b></summary>

아닙니다. BotHub는 독립적으로 개발된 클라이언트로 Meta, xAI, Hark, OpenAI와 관련이 없습니다. 각 플랫폼의 본인 계정을 사용합니다.

</details>

<details>
<summary><b>계정과 토큰은 어디에 저장되나요?</b></summary>

사용자의 컴퓨터에만 저장됩니다. 웹 세션은 계정별 Electron 파티션에, 토큰과 프록시 비밀번호는 `safeStorage`(macOS에서는 키체인)로 암호화해 `0600` 권한으로 저장합니다. BotHub는 원격 측정 데이터를 보내지 않습니다.

</details>

<details>
<summary><b>macOS에서 BotHub를 열 수 없다고 나와요.</b></summary>

아직 서명되지 않은 빌드이기 때문입니다. 앱을 마우스 오른쪽 버튼으로 눌러 **열기**를 선택하거나 `xattr -cr /Applications/BotHub.app`을 실행하세요. [빠른 시작](#-빠른-시작)을 참고하세요.

</details>

<details>
<summary><b>메시지가 오랫동안 "전달됨 · 답변 중"으로 표시돼요. 다시 시도하면 두 번 전송되나요?</b></summary>

아니요. 플랫폼이 메시지를 받으면 BotHub는 그 메시지를 미전송으로 다루지 않습니다. 답변이 오지 않으면 *답변 없음*과 함께 **다시 보내기** 버튼이 표시되며, 이 버튼은 같은 내용을 한 번 더 보낸다는 점이 명확합니다.

</details>

<details>
<summary><b>계정마다 다른 프록시를 쓸 수 있나요?</b></summary>

네. Muse와 Dot 계정은 HTTP 또는 SOCKS5 프록시를 사용할 수 있습니다. 프록시를 적용할 수 없으면 직접 연결로 바꾸지 않고 해당 계정의 통신을 차단합니다.

</details>

## 📄 라이선스

[MIT 라이선스](../../LICENSE)로 배포됩니다.
