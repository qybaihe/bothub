# Hark Pro（hark.com / app.hark.com）Web 协议分析

来源：公开页面 + `assets.hark.com` 前端 bundle 静态分析 + 未登录 live probe（2026-11-03，Asia/Singapore）。  
**未做完整 Google 登录**（按任务要求：只文档化流程；OTP/OAuth 完成由 parent 用 sign-in skill + Gmail）。  
所有 token / cookie / Turnstile site key / analytics key 已脱敏。样本在 `samples/`。

> 一句话架构：**Vite/React SPA（`app.hark.com`）+ better-auth（`/api/auth/*`，OAuth 回调在 `auth.hark.com`）+ 同源 Go API（`https://app.hark.com/api/...`，`credentials: include`）**。聊天主路径是 REST：`POST /api/messages/send` + `GET /api/conversations*`。登录页 bundle **没有**独立 chat WebSocket；语音 realtime 另有 LiveKit/观测 API。桌面有 Tauri/mac 壳（`__TAURI_INTERNALS__` / mac banner）。

---

## 0. 置信度

| 区域 | 置信度 | 依据 |
|---|---|---|
| Hosts / `/api` base / CORS / Go 错误形态 | **高** | live OPTIONS/GET/POST |
| better-auth 登录族（Google PKCE、email OTP、magic link、Apple、2FA、Turnstile） | **高** | live + login bundle |
| 业务 REST 路径目录（conversations/messages/scheduled-tasks/…） | **高** | `CW_KT811.js` API client |
| Send 请求形状（`timezone` + `conversationId` query `cid`） | **中高** | client 源码；**响应 JSON schema 未 live 验证** |
| 流式回复通道 | **中低** | send 走 `fetch→json()`（非 SSE reader）；有 `conversations/status`、push `message_received`；**缺登录后 netlog** |
| Session cookie 确切名字 | **中** | 见 `__Secure-hark.*` 前缀 + better-auth + `set-auth-token` expose；**未在已登录 Set-Cookie 上确认** |
| 每账号代理 | n/a（BotHub 本地能力，非 Hark 服务端协议） | — |

---

## 1. 域名与运行时

| 角色 | Host |
|---|---|
| 营销站 | `https://hark.com`（Vercel） |
| 产品 SPA | `https://app.hark.com`（Cloudflare，`x-hark-region` / `x-hark-served-region`） |
| Auth 回调 | `https://auth.hark.com`（Google/Apple `redirect_uri`） |
| 静态资源 | `https://assets.hark.com/assets/*` |
| PostHog（误称 flags） | `https://api.hark.com/v1/flags`（`__HARK_RUNTIME_CONFIG__.posthogHost`） |
| 直连 `api.hark.com` 业务 REST | **未发现**（未登录探均为 404）；浏览器业务走 **同源** `app.hark.com/api` |

前端 API base（`BJvakwRj.js`）：

```js
() => `${window.location.protocol}//${window.location.host}/api`
// → https://app.hark.com/api
```

`window.__HARK_RUNTIME_CONFIG__`（登录页内嵌，脱敏见 `samples/runtime_config.redacted.json`）：
- `version`: `release-2026.11.03.2`
- `turnstileSiteKey`, `phoneSignUpEnabled`, `signInPaused` / `signUpPaused`
- analytics：mixpanel / posthog / sentry（密钥勿入库）

未登录访问 `/`、`/home`、`/chat` 等 → **401 Unauthorized**（空/短 body）。`/login` → 200 HTML。

---

## 2. 认证（better-auth）

### 2.1 端点（均在 `https://app.hark.com`）

| Method | Path | 未登录实测 |
|---|---|---|
| GET | `/api/auth/ok` | `{"ok":true}` |
| GET | `/api/auth/get-session` | `null` |
| POST | `/api/auth/sign-in/social` | 需 `{provider}`；Google/Apple 返回 `{url, redirect:true}` |
| POST | `/api/auth/sign-in/email-otp` | 需 email+otp；错误 OTP → `INVALID_OTP`（**无 captcha**） |
| POST | `/api/auth/email-otp/send-verification-otp` | **CAPTCHA_REQUIRED**（无 Turnstile） |
| POST | `/api/auth/sign-in/magic-link` | **CAPTCHA_REQUIRED** |
| POST | `/api/auth/sign-in/email` | **CAPTCHA_REQUIRED** |
| POST | `/api/auth/phone-number/send-otp` | **CAPTCHA_REQUIRED** |
| POST | `/api/auth/sign-out` | `{"success":true}` |
| GET | `/api/auth/multi-session/list-device-sessions` | `[]` |
| POST | `/api/auth/multi-session/set-active` | `ACCOUNT_SWITCH_EMPLOYEES_ONLY`（至少未登录/非员工如此） |
| POST | `/api/account-switch/remember` | 存在（账号切换前记住当前会话） |

CORS（auth + Go API）：
- `access-control-allow-origin: https://app.hark.com`
- `access-control-allow-credentials: true`
- `access-control-expose-headers: set-auth-token`（bearer/token 头模式痕迹）
- Go API allow-headers: `Content-Type, Authorization, X-Hark-Locale`
- Auth 另允许客户端带 `x-captcha-response`

客户端：`better-auth` createClient，`baseURL = window.location.origin`，`basePath` 默认 `/api/auth`，`credentials: "include"`。  
插件（login bundle）：`username`, `magic-link`, `email-otp`, `generic-oauth-client`, `two-factor`, `multi-session`。

### 2.2 Google 登录（推荐 BotHub 路径）

1. 打开 `https://app.hark.com/login`，点 Continue with Google →  
   `POST /api/auth/sign-in/social`  
   body: `{ "provider": "google", "callbackURL": "https://app.hark.com/" }`  
   （可选 `errorCallbackURL` 带 `oauth_provider=google`）
2. 响应 JSON + `Location` 头指向 Google OAuth v2 **PKCE**：
   - `client_id`: `219304801992-6n2dhq838s5d9gs943omjdaervr6apq7.apps.googleusercontent.com`（公开）
   - `redirect_uri`: `https://auth.hark.com/api/auth/callback/google`
   - `scope`: email profile openid + userinfo.*
   - `code_challenge_method=S256`, `access_type=offline`, `prompt=select_account`
3. Set-Cookie（Domain=`hark.com`）：
   - `__Secure-hark.state=<state>.<sig>`（HttpOnly Secure SameSite=Lax, Max-Age=600）
   - `__Secure-hark.region_flow=us`
4. Google 同意后 → `auth.hark.com` callback → 再回到 `app.hark.com`（可能再走 `/login?twoFactor=1` 若启用 2FA）。
5. 会话：`GET /api/auth/get-session` 应返回 user/session（形状待登录后抓）；CORS 暴露 `set-auth-token`，native 客户端或可改 bearer。

**不要**在无 GUI/无用户确认时自动开 Google 同意屏。Parent 用 sign-in skill；若落到邮箱 OTP，从 Gmail `<your-google-account@example.com>` 读码。

### 2.3 邮箱 / Magic link / 手机

- 发码类接口要 **Cloudflare Turnstile**：header `x-captcha-response: <token>`。  
  前端 `Er(action)`（login 里叫 `Ze`）加载 `challenges.cloudflare.com/turnstile/v0/api.js`，`execution: "execute"`, `appearance: "interaction-only"`，action 例：`email_code` / `magic_link` / `password`。
- Google social **不需要** captcha（已 live）。
- 邮箱 OTP **校验**接口对错误 OTP 直接 `INVALID_OTP`，未见 captcha。

### 2.4 Cookie / Token（推断）

已观察到：`__Secure-hark.state`, `__Secure-hark.region_flow`, `__cf_bm`。  
Session 名大概率同前缀（如 `__Secure-hark.session_token`）或 better-auth 默认变形——**必须在首次成功登录的 Set-Cookie 上确认**，写入 `samples/session_cookies.redacted.json`。  
`multiSession.listDeviceSessions` 映射里会话以 `session.token` 暴露给前端（用于 setActive）——native 侧可优先尝试 cookie jar，必要时再试 `Authorization` / `set-auth-token`。

### 2.5 多账号

前端有 `hark.pendingAccountAdd` localStorage + `/login?addAccount=1` 流程；`set-active` 对普通账号可能员工限定（live 报 `ACCOUNT_SWITCH_EMPLOYEES_ONLY`）。BotHub 多账号更稳妥的做法：**每账号独立 partition cookie jar**（与 Muse 相同），不要依赖 Hark 官方 multi-session，除非登录后证实对消费者开放。

---

## 3. Go 业务 API（`https://app.hark.com/api`）

### 3.1 客户端约定（`CW_KT811.js`）

- `credentials: "include"`
- 每个请求注入 `X-Hark-Locale: <locale>`
- 错误：`GoApiError` / body 文本；**401 → 触发客户端登出钩子**
- POST `gt`, GET `pt`, PATCH `yt`, PUT `ft`, DELETE `It`
- 完整路径表：`samples/api_paths.json`（约 100+）

### 3.2 BotHub 关键路径

| 能力 | Method | Path | 备注 |
|---|---|---|---|
| 主会话（产品强调 single thread） | GET | `/conversations/main?timezone=...` | |
| 会话列表 | GET | `/conversations` | |
| 创建会话 | POST | `/conversations` | |
| 更新/删/归档 | PATCH/DELETE/POST | `/conversations/:id` … `/archive` `/unarchive` `/viewed` | |
| 会话状态（疑似未读/运行中） | GET | `/conversations/status` → `.statuses` | **流式/进度候选** |
| **发消息** | POST | `/messages/send?cid=<conversationId>` | body: `{ timezone, ...fields, conversationId }`；客户端 30s abort |
| 停工具 / 暂停 agent | POST | `/messages/stop-tool`, `/messages/pause-agent` | |
| 搜索消息 | GET | `/search/messages?q=` | |
| 资料 | GET/PATCH | `/profile` | |
| 登录设备会话（非 chat） | GET/DELETE | `/sessions`, `/sessions/:id` | |
| 定时任务 | GET/POST/PATCH/DELETE | `/scheduled-tasks`… `/pause` `/resume` `/runs` | |
| 连接器 | GET/POST/DELETE | `/connectors`… | |
| 邀请 | GET/POST | `/invite`, `/invite/claim`, … | |
| 账单/额度 | GET/POST | `/billing/summary`, `/billing/options`, checkout/topup/portal | |
| 浏览器 feature flags | GET | `/browser-flags` | |
| Home cards | GET/POST | `/home/cards`… | |
| Secrets / Secured by Hark | CRUD | `/secrets`… `/reveal` | **高敏感，BotHub 慎代理** |
| Realtime 观测（语音） | GET | `/realtime/observability/sessions`… | 需 `X-Hark-Access-Reason`；含 transcript schema |

未登录：`GET /api/profile` 等 → `{"error":"unauthorized"}`；`POST /api/messages/send` 无 body/未登录 → 401 或 405。

### 3.3 发消息 / 「流式」——当前判断

1. **发送**：`POST /api/messages/send?cid=...`，JSON in / **JSON out**（`i.json()`），不是 EventSource。
2. **进度/回复同步** 更可能是：
   - 轮询 `GET /conversations/main` 与/或 `GET /conversations/status`
   - 桌面/Web push：`message_received` / `question` / `user_input_required` / `task_completed`（见 `BKCN1_1W.js`）
   - Handoff 长任务异步完成后推送，再 refetch
3. Sentry 里对 `text/event-stream` / `ndjson` 的 instrumentation **不能**当作已证实的 chat SSE。
4. LiveKit 字符串仅出现在 i18n「LiveKit recording」——语音链路另案；**文本 chat 不要假设 wss**。

**登录后第一优先补强**：Chrome netlog / CDP 录一次「发 hi → 看回复」，确认 send 响应字段与是否有 SSE/WS。

### 3.4 消息/会话 schema 碎片（Zod，未 live）

`DDiZ7N3r.js` / realtime observability：
- transcript message: `{ messageId, role: "user"|"assistant", content, createdAtMs, sequence }`
- conversation list-ish: `{ id, title, provider, favorite, createdAt, updatedAt, messages?, … }`
- agent realtime envelope: `{ type, data, agent_id, channel, timestamp, … }`

Send 的其余 body 字段（text/attachments/…）在登录页 chunk 无 call site——**待主壳 chunk 或 netlog**。

---

## 4. 其它产品面（可二期）

- **Scheduled tasks**：完整 CRUD/pause/resume/runs（比 Muse 更全，含 pause/resume/update）。
- **Connectors / channel bindings**：Slack、Telegram、Linq。
- **Billing**：summary / checkout / topup / auto-topup / portal / request-costs。
- **Invite codes**、**Home cards**、**Hark Card** onboarding、**managed credentials**、**phone identity**。
- **Tauri / mac app**：login 检测 `__TAURI_INTERNALS__`；push / multi-account 与 shell 事件。

---

## 5. BotHub 集成建议

### 推荐形状（v1）

**WebContentsView / 分区嵌入 `https://app.hark.com` 做登录 + cookie 持久化**，主进程用 **同源 cookie 调 Go REST**（native HTTP 客户端），UI 用 BotHub 自己的 chat chrome——与早期 Muse hook 不同：Hark 的 REST 表面干净，**值得原生发消息**；但 **OAuth/Turnstile/2FA 必须嵌入浏览器**。

| 层 | 做法 |
|---|---|
| 加号登录 | BrowserView → Google（用户账号 `<your-google-account@example.com>`）；监听 `get-session` ≠ null 或 cookie 出现 session |
| Session 存储 | 每账号 Electron `partition` + 可选 safeStorage 备份 cookie；**勿写明文 world-readable** |
| List / transcript | `GET /conversations` + `/conversations/main` |
| Send | `POST /messages/send?cid=` + Locale + cookie |
| Stream | v1：send 后 poll `conversations/status` + `/main`；有 push 再接；确认 SSE 后再升级 |
| 代理 | **BotHub 本地 per-account HTTP(S)/SOCKS** 挂到该 partition / net session（非 Hark API） |
| 风险 | `/secrets/reveal`、支付、Handoff 自动操作——默认只读或需用户确认 |

### 不推荐

- 纯 hook 模拟输入（Muse 旧病）。
- 一上来逆向 Secured-by-Hark / Keychain。
- 依赖未证实的 chat WebSocket。

### 与 Muse/Grok 对照

| | Muse | Grok Bot | Hark |
|---|---|---|---|
| 传输 | Noise WS | ConnectRPC | **HTTPS JSON** |
| 登录 | Meta OTP | sand PKCE | **Google better-auth PKCE** |
| 流式 | `chat.stream` | Watch | **待证实（poll/push 优先假设）** |

---

## 6. 安全与脱敏

- 禁止提交：session cookie、`set-auth-token`、Turnstile/PostHog/Mixpanel/Sentry 密钥、OAuth `state`/`code`、invite codes、`/secrets/reveal` 内容。
- OAuth `client_id` 为公开客户端 ID，可留在文档。
- 样本仅保留 `*.redacted.json` / `login.redacted.html` / `api_paths.json`。
