# Handoff → Claude：Hark（hark.com）接入 BotHub

## 已完成（本轮 Grok 逆向，未登录 live）

| 文件 | 用途 |
|---|---|
| **protocol.md** | 认证 + Go REST + 流式假设 + 集成建议 |
| `samples/api_paths.json` | `/api/*` 路径目录（来自 `CW_KT811.js`） |
| `samples/oauth_google_start.redacted.json` | Google PKCE 启动（脱敏） |
| `samples/auth_probes.redacted.json` | 未登录 probe 摘要 |
| `samples/runtime_config.redacted.json` | `__HARK_RUNTIME_CONFIG__`（密钥已红） |
| `samples/login.redacted.html` | 登录页壳（密钥已红） |

源码切片在 box `/workspace/hark/js/`（含 `CW_KT811.js` API client、`login-*.js`、`KHpIF24M.js` better-auth）——**按需自取，勿把整包密钥配置提交进 git**。

## 你要做的

### P0 — 登录打通（需用户 GUI / Google）
1. BotHub 加 `hark` 平台：登录用 **WebContentsView** → `https://app.hark.com/login` → **Continue with Google**（账号 `<your-google-account@example.com>`）。
2. 成功判据：`GET /api/auth/get-session` 非 `null`，或 partition 出现 session 类 `__Secure-hark.*` cookie（**名字以 Set-Cookie 为准，写入 samples**）。
3. 若落到 email OTP：parent/Grok 可读 Gmail；发码接口要 **Turnstile**（`x-captcha-response`），嵌入页比自己打 captcha 现实。
4. Cookie 进 safeStorage / partition；**禁止明文 token 文件**。

### P0 — 原生 REST 最小闭环
1. `src/main/hark/`：带 cookie 的 `fetch` 封装（base `https://app.hark.com/api`，头 `X-Hark-Locale`，`credentials`）。
2. IPC：`profile`、`conversations.main`、`conversations.list`、`conversations.status`、`messages.send`。
3. Send：`POST /messages/send?cid=<id>` body 至少 `{ timezone, conversationId, /* text 字段名待 netlog */ }`。  
   **登录后立刻录一条 send 的请求/响应**，补 body 字段名与响应 schema。
4. 「流式」v1：send 后短轮询 `conversations/status` + `conversations/main`；同时看 Network 是否出现 SSE/WS，有则升级。

### P1
- scheduled-tasks / billing.summary / connectors 只读面板（路径已在 api_paths）。
- per-account 代理：挂 Electron session proxy（本地能力）。
- 多账号：独立 partition；不要默认依赖 `/api/auth/multi-session/set-active`（live 见 `ACCOUNT_SWITCH_EMPLOYEES_ONLY`）。

### 不要做
- 挖 Keychain / Secured-by-Hark reveal 自动化。
- 未批准不 push / 不发版。
- 把 PostHog `api.hark.com/v1/flags` 当成业务 API。

## 建议实现顺序
1. 嵌入登录 + session 持久化  
2. list/main + send + poll 显示回复  
3. E2E 截图  
4. 再谈 tasks/billing/connectors  

## 优先级问用户
- 现在是否立刻在 GUI 里走一遍 Google 登录以便抓 send netlog？（用户曾说 Grok GUI 登录先不做；Hark 需要另确认。）
