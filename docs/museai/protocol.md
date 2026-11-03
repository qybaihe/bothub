# Meta Muse（muse.ai / Hatch）Web 协议分析

> 来源：Chrome net-export `museai-netlog-2.json` / `museai-netlog-confirm.json` / `museai-netlog-allow.json`（含原始字节与登录态，分析完成后已删除）+ 前端 JS bundle（`museai/js/`、`museai/js_allow/`）。  
> 录制账号：`<redacted-test-account@example.com>`（已连接 Browser + GitHub）。录制时间约 2026-11-03 01:49–02:16（Asia/Singapore）。  
> Allow 抓包确认：用户点 Allow → toast「Request approved」→ 随后 `create_repository` 因 GitHub App 权限 403（仓库未创建；属连接器权限，非 Sentinel decide 失败）。  
> **所有 token / cookie / OIDC code 已脱敏。** Noise 帧仍为密文；`egress.*` 请求/响应形状由前端归一化器还原。解析产物在 `museai/samples/`，客户端草图在 `museai/muse_client.py`。

---

## 0. 一句话结论

**真正的 Meta Muse 是 https://muse.ai（产品内部名 Hatch），不是 https://www.meta.ai。**

架构：

```
浏览器 ──HTTPS──► muse.ai（Next.js 控制面：OIDC 登录、租 VM、发 token、埋点）
       ──WSS───► hatch.metaaivm.com/v1/noise  （Noise_XX 加密通道）
                    └─ 里面跑「HTTP-over-Noise」RPC
                       ├─ chat.* / session.* / memory.*
                       ├─ connectors.*（含 GitHub）
                       └─ egress.*（Sentinel 确认卡，service=sentinel）
```

发消息、流式回复、连接器、记忆、待确认审批**全部走 Noise WebSocket 上的网关 RPC**，不走 `/api/graphql`，也不走 `/api/falco`（falco 只是埋点）。

与旧的 `www.meta.ai` 协议**完全不同**——见文末对比表。

---

## 1. 与 www.meta.ai 的差异（必读）

| | **muse.ai（真正的 Muse / Hatch）** | **www.meta.ai（之前误扒的）** |
|---|---|---|
| 产品 | 云端常驻 Personal Agent（有 VM、Browser、GitHub、Sentinel） | Meta AI 聊天助手 |
| 主聊天通道 | `wss://hatch.metaaivm.com/v1/noise`（Noise_XX_25519_AESGCM_SHA256） | `wss://gateway.meta.ai/ws/clippy`（自定义二进制 + protobuf） |
| 控制面 API | `muse.ai/api/*`（租 VM、token、OIDC、auth/check） | `www.meta.ai/api/graphql`（Relay 持久化查询） |
| 会话 cookie | `hatch_sess` / `hatch_gw` / `hatch_vml` + 登录期 `hatch_native_auth_*` | `ecto_1_sess` |
| 发消息 | 网关 RPC `chat.stream` | clippy WS 二进制帧 |
| 待确认 | Sentinel：`egress.approvals` / `egress.approval.decide` | 无真正确认卡（只有聊天里的 "reply YES"） |
| 连接器 | `connectors.*` + Browser VM + GitHub App 安装 | Google Drive / Gmail 等（多数未连） |
| 记忆 | 网关 `memory.search/get/consolidate/reindex` | 网页无记忆页；靠会话上下文 |
| 嵌入难度 | Noise 握手 + 远程证明 + zstd，**裸协议客户端极难**；BotHub 应用 Electron 内嵌真实会话 | 相对可在同 cookie 下复现 GraphQL + clippy |

**BotHub 建议**：Muse 适配器第一期用 Electron `WebContentsView` + partition 隔离，在真实已登录页面里工作；原生 Noise 客户端作为后期可选增强。

---

## 2. 认证（OIDC + Cookie + VM Token）

### 2.1 登录跳转（本次抓包完整录到）

```
GET  https://muse.ai/api/oidc/start
  → 307
GET  https://auth.meta.com/oidc
       ?app_id=1302642031697155
       &scope=openid+linking
       &response_type=code
       &redirect_uri=https://auth.muse.ai/oidc/muse/
       &state=<base64 JSON: {csrf_token, redirect_to: https://muse.ai/oidc/callback}>
       &prompt=login
       &code_challenge=<S256>
       &code_challenge_method=S256
  → （Meta 账号密码 / 邮箱验证码 / 2FA）
GET  https://auth.muse.ai/oidc/muse/?code=…&state=…
  → 302
GET  https://muse.ai/oidc/callback?code=…&state=…
  → 307
GET  https://muse.ai/access
  → 307 → /
POST https://muse.ai/api/auth/save-account   → {"saved":true}
GET  https://muse.ai/api/consent/status      → {"needs_cookie_consent":false,…}
POST https://muse.ai/api/auth/check          → 见下
```

PKCE：`oauth_pkce_verifier` / `oauth_csrf_token` cookie。另有 `hatch_post_login_intent`、`hatch_checkpoint_oidc_return`。

### 2.2 会话 Cookie（域 `.muse.ai` / `muse.ai`）

| Cookie | 作用 |
|---|---|
| `hatch_sess` | 主会话 |
| `hatch_gw` | 网关相关 |
| `hatch_vml` | VM 租约相关 |
| `hatch_native_auth_csrf` / `_temp` / `_device` / `_state` | 登录/原生认证过渡 |
| `datr` / `wd` / `dpr` / `_fbp` | 设备与埋点 |

### 2.3 `POST /api/auth/check`

响应（脱敏）：

```json
{
  "ok": true,
  "access_token": "<ABRA… Meta 风格 token>",
  "session_binding_id": "<base64url>",
  "viewer_id": "1334518776420497",
  "outcome": "validated"
}
```

首页 RSC 里同样内嵌 `viewerId` + `accessToken`。

### 2.4 租 VM 与 Noise 凭证

1. `POST /api/hatch/vm/wake` → `{"status":"wake_requested"}`
2. `POST /api/hatch/lease-vm` body `{"vmType":"…"}` →  
   `{"status":"assigned","gatewayUrl":"wss://<vmId>.metaaivm.com/","vmName":"<vmId>","vmId":"<vmId>"}`
3. `POST /api/hatch/token` body `{"vmAddress":"<gateway>","vmName":"…"}` →  
   `{token, notary_token?}` —— token 形如 `s0:<EdDSA JWT>`
4. `POST /api/hatch/noise-notary-token` body `{"vmName":"…"}` → `{notaryToken}`

首页 bootstrap 已带好 `gatewayUrl` / `vmName` / `authToken`（RUNNING 状态）。

---

## 3. Noise 网关传输层

### 3.1 WebSocket URL

前端把 `wss://<vmId>.metaaivm.com/` 规范成：

```
wss://hatch.metaaivm.com/v1/noise
  ?vm_id=<vmId>
  &auth_token=<s0:JWT>
  &notary_token=<endorsement.v1.…>（可选）
  &app_id=hatch-web
  &request_id=<uuid>
```

### 3.2 密码套件与帧

- 握手：**Noise_XX_25519_AESGCM_SHA256**（libsodium X25519）
- 载荷可选 **zstd** 压缩
- **拒绝明文帧**（`Rejecting plaintext frame on Noise connection`）
- 帧装配：`NoiseFrame{chunkId, chunkIndex, totalChunks, payload}` → 解密后得到  
  `ServiceEnvelope{service, payload}` →  
  `StreamFrame{streamId, kind: request|response|bodyChunk|reset}`
- 请求侧把「HTTP 语义」编进 protobuf：  
  `HttpRequest{verb, path, headers[], body, endBody}`
- JSON body：非 GET 且 `requestBody≠empty` 时，`JSON.stringify(params)` UTF-8
- GET：params 进 query string
- 头里常见 `Content-Type: application/json`、`Accept-Language`

服务名（`service` 字段）包括：默认 daemon、`sentinel`（审批）、`authd`（凭证/自定义连接器）、`ssh_access`、`vault` 等。

### 3.3 对 BotHub 的含义

没有完成 Noise 握手 + 远程证明，就**无法**在浏览器外直接调用 `chat.stream` / `egress.approvals`。  
可行路径：

1. **推荐**：Electron 内嵌 muse.ai，读 cookie / 注入 preload 调页面里的 `sendRequest`
2. **后期**：移植 Noise_XX + protobuf schema（需从 JS 反编译完整 `.proto`）+ notary 验证

---

## 4. 网关 RPC 方法目录（387 个）

完整表：`samples/gateway_methods.json`（由 `139ad6to7j8dj.js` 方法注册表抽出）。

### 4.1 聊天（核心）

| method | HTTP | path | 说明 |
|---|---|---|---|
| **chat.stream** | POST | `/chat/stream` | **发消息 + 订阅流式回复**（noiseOnly） |
| chat.stream_events | POST | `/chat/stream-events` | 流事件（noiseOnly） |
| chat.subscribe | POST | `/chat/subscribe` | 订阅（noiseOnly） |
| chat.history | GET | `/chat/history` | 历史 |
| chat.history_window | GET | `/chat/history-window` | 窗口历史 |
| chat.cancel | POST | `/chat/cancel` | 取消生成 |
| chat.delete_turn | POST | `/api/chat/delete-turn` | 删一轮 |
| chat.message_get | GET | `/chat/message` | 单条 |
| chat.search | GET | `/chat/search` | 搜索 |
| chat.mark_seen | POST | `/api/chat/{thread_id}/seen` | 已读 |
| chat.unread_count | GET | `/chat/unread-count` | 未读 |
| chat.poke | POST | `/chat/poke` | poke |
| session.start / archive / pin / rename / delete | POST | `/session/*` | 会话管理 |
| sessions.list | GET | `/api/session/list` | 会话列表 |

**发消息实测形状（前端）：**

```js
sendRequest("chat.stream", {
  items: [{ type: "text", text: userText }],
  node_id: deviceId,
  session_id: threadSessionId,  // 在已有线程里时带上
  capabilities: clientCapabilities
})
```

发送前会 `dispatchEvent("hatch-user-message-sent")`，并 set `chat/start_stream`。

### 4.2 Sentinel 确认卡（待审批）——BotHub Attention Bar 的关键

全部 `service: "sentinel"`（HTTP-over-Noise；抓包看不到明文，以下由 `00z4km9l8x5ty.js` / `17ze4iivcm-44.js` 还原）：

| method | path | 说明 |
|---|---|---|
| egress.approvals | GET `/approvals` | 待确认列表 |
| egress.approval | GET `/approvals/{id}` | 详情 |
| egress.approval.decide | POST `/approvals/{id}/decide` | **同意/拒绝** |
| egress.approval.history | GET `/approvals/history` | 历史 |
| egress.approval.edit_message | POST `…/edit-message` | 编辑待发消息 |
| egress.permissions* | `/permissions…` | HITL / 网络 / 连接器权限策略 |

聊天状态机旁路字符串（非 approval.status）：

- 待确认：`pending_user_confirmation` / `background_pending_user_confirmation` / `__pending_approval__`
- 已决：`user_confirmed` / `user_denied` / `resumed_after_confirmation`

#### 枚举

| 字段 | 合法值 |
|---|---|
| `status` | `pending` / `approved` / `denied` / `timed_out` |
| `decision`（已决/decide 入参） | `allow_once` / `allow_session` / `allow_always` / `auto_allow` / `deny` / `deny_always` / `timed_out` |
| `decision_options[].kind`（可点选项） | `allow_once` / `allow_session` / `allow_always` / `deny` / `deny_always` |
| `always_scope` / `allow_always_scope` | `destination` / `destination_domain` / `entity` / `connector_all_actions` / `recipient` |

#### `egress.approvals`

- **请求**：`{}`（`sendRequest("egress.approvals", {})`，staleTime 5s）。
- **响应**（前端 `tt()` 双形状兼容）：
  - **legacy**：`{ "pending": [ApprovalObject…], "recent": [ApprovalObject…] }`
  - **snapshot**：`{ "pending_approvals": [ApprovalSnapshot…], "recent_approvals": [ApprovalSnapshot…] }` → 客户端记 `source: "snapshot"`
- Snapshot 顶层键：`approval_id`、`requested_at_ms`、`request_expires_at_ms`、`decided_at_ms`、`status`、`decision`、`always_scope`、`decision_reason`、`approval_type`、`is_exclusive`、`editable_message_available`、`message_revision`、`decision_options`、`display`、`scope`、`process`、`payload`。
- `payload.type` ∈ `browser_task_confirmation` / `browser_checkout` / `stripe_link_checkout` / `shopify_checkout` / `outgoing_media` / `browser_action` / `network` / `device` / `connector`；具体内容在 `network_payload` / `connector_payload` / `device_payload` 等之一。
- `decision_options[]`（snapshot）：`{ kind, label: { kind, scope? }, label_text, opens_url? }`。`label.kind` 含 `allow` / `allow_once` / `allow_for_this_task` / `allow_all_web_access_for_this_task` / `allow_for_this_scheduled_task` / `allow_for_this_artifact` / `allow_for_your_feed` / `allow_always` / `allow_always_scoped` / `deny` / `deny_for_*` 等（只影响按钮文案；真正 RPC `decision` 仍是上表短枚举）。

脱敏样例：`samples/approval_list_response.redacted.json`、`samples/approval_object_flat.redacted.json`。

#### `egress.approval`

- **请求**：`{ "approval_id": "<id>" }`
- **响应**：审批对象本身（legacy 扁平）或经 snapshot 归一化；缺失关键字段时前端走 malformed 兜底并仍展示。

#### `egress.approval.decide`

前端 `td()` 组装请求：

```json
{
  "approval_id": "<id>",
  "decision": "allow_once",
  "always_scope": "<仅 decision 为 allow_always|deny_always 时>",
  "allow_always_scope": "<仅 decision 为 allow_always 且有 scope 时，与 always_scope 同值>",
  "reason": null,
  "expires_at_ms": null,
  "notification_channel": "ui",
  "expected_message_revision": null
}
```

- UI 点击时 **`notification_channel` 固定为 `"ui"`**。
- **响应**：`{ "approval": <ApprovalObject> }`（再经 `e3` 归一化）。`status` 变为 `approved`/`denied`，写入 `decision` / `decided_at_ms` / `decided_by` 等。

样例：`samples/approval_decide_request.example.json`、`samples/approval_decide_allow_always_request.example.json`、`samples/approval_decide_response.redacted.json`。

#### UI → RPC 映射（Allow 抓包实测路径）

主按钮（`data-hatch-approval-primary-action`）与 `ap(approval, "allow")`：

| UI | RPC `decision` | scope |
|---|---|---|
| **Allow** / **Allow once** / Allow for this task·artifact·scheduled task / Allow all web access for this task | **`allow_once`**（实际取值） | 无 |
| 例外：无 `decision_options` 且 `spaceReaderGrantEligible` | `allow_always` | 默认 `entity`（`P()`） |
| **Allow always** / Always allow this site / Allow all {connector} actions | `allow_always` | `label.scope` 或 `P()`：普通网卡 `destination_domain`；spaceReader/特殊 connector → `entity` |
| **Deny** | `deny`（spaceReader 无 options 时 → `deny_always`） | 永久拒绝时同 `P()` |

成功 toast（`E()` / `eP`）：

- `allow_once`（及 default）→ **「Request approved」**
- `allow_session` → 「Request approved for this task」
- `allow_always` + scope → 「Request approved permanently for this domain|entity|…」
- `deny` → 「Request denied」

完整映射表：`samples/approval_ui_to_rpc_mapping.json`。

本次用户流程：点 Allow → decide(`allow_once`) → toast「Request approved」→ 代理继续 `create_repository` → GitHub App 权限 **403**（仓库未创建）。Sentinel 审批本身已通过。

前端还有 `pending_approval_browser_notification` —— Browser 任务等待接管时的通知。

### 4.3 连接器（含 GitHub）

| method | path |
|---|---|
| connectors.list | GET `/connectors` |
| connectors.homepage | GET `/connectors/homepage` |
| connectors.get | GET `/connectors/{id}` |
| connectors.connect_info | GET `/connectors/{id}/connect/info` |
| connectors.connect | POST `/connectors/{id}/connect` |
| connectors.disconnect | POST `/connectors/{id}/disconnect` |
| connectors.permissions | GET `/connectors/{id}/permissions` |
| connectors.accounts* | 多账号 link/unlink |
| github.installation.callback | POST `/api/github/installation/callback` |
| custom_connectors.* | `/v1/custom-connectors/*`（service=authd） |

前端路由：

- `/connectors`、`/connectors/homepage`
- `/connectors/connect/{id}`、`/connectors/disconnect/{id}`
- `/connect/github-installation-callback`

Browser 相关另有一整套 `browser_task.*` / `browser.lease` / `browser_stream.attach`（websockify），对应云端浏览器画面与人工接管。

### 4.4 记忆

| method | path |
|---|---|
| memory.search | POST `/memory/search` |
| memory.get | POST `/memory/get` |
| memory.consolidate | POST `/memory/consolidate` |
| memory.reindex | POST `/memory/reindex` |

（具体 JSON 字段需在 Noise 通道里再抓一次明文；前端有 Memory import handoff 流程。）

### 4.5 其他对 BotHub 有用的

- `activity.list` / `activity.subscribe` —— 活动流（可做 Running 状态）
- `tasks.*` / `skills.*` —— 定时任务与技能
- `agent.status` / `subagents.*` / `shared_agents.*`
- `voice.*` —— 语音通话
- `spaces.*` —— Artifact / Space
- `config.get` / `vm.health`

---

## 5. muse.ai 控制面 HTTP API（不经 Noise）

前端静态字符串里出现的路径（部分在本次抓包打到）：

| 路径 | 作用 |
|---|---|
| `POST /api/falco`、`/api/falco/v2` | **埋点**，响应 `{"success":true,"accepted":N}` |
| `POST /api/auth/check` | 校验会话，发 access_token |
| `POST /api/auth/save-account` | 登录后存账号 |
| `GET /api/oidc/start` | 开始 OIDC |
| `GET /api/consent/status` | Cookie 同意 |
| `POST /api/hatch/vm/wake` | 唤醒 VM |
| `POST /api/hatch/lease-vm` | 租 VM |
| `POST /api/hatch/token` | 网关 auth_token |
| `POST /api/hatch/noise-notary-token` | notary |
| `GET /api/hatch/invite` | 邀请状态 |
| `POST /api/hatch/stateful-sharing` | 状态共享开关 |
| `POST /api/hatch/reset-vm` | 重置 VM |
| `GET /api/client-ip` | 客户端 IP |
| `GET /api/checkout/stripe/publishable-key` | 支付 |
| `POST /api/session/fileserver-read` 等 | 文件 |
| Next.js Server Action `POST /` | 订阅信息等（RSC flight） |

---

## 6. 侧边栏 / 路由（UI 面板）

前端 router 的 panel 类型与展示名：

| panelType | displayName |
|---|---|
| chat | Chat / New Thread / Thread |
| files | Library: Recent / Documents / Media / System Files / Podcasts |
| artifacts | Artifacts |
| ideas | Ideas |
| feed | Feed |
| space / space_edit | Artifact / Edit / Saved / Shared Space |
| goals | Goals / Goal |
| connections | Connections（连接器） |
| agents | Shared Agents |

另有设置里的 Channels（Telegram / WhatsApp / Messenger）、Permissions、Billing（Stripe）等。

PWA manifest：`name=Muse`，`id=meta_ai`，`start_url=/?__pwa=1`。

---

## 7. 状态灯映射建议（BotHub）

| BotHub 四态 | Muse 信号 |
|---|---|
| 🟢 Idle | Noise 已连接 + 无 stream + 无 pending approval |
| 🔵 Running | `chat/start_stream` 期间，或 `activity`/`browser_task`/`tasks` 进行中，或 VM wake |
| 🟠 Action Required | `egress.approvals` 非空，或 `pending_user_confirmation`，或 browser takeover |
| 🔴 Error | Noise 握手失败 / `backendAuthStatus=rejected` / VM 非 RUNNING / WebSocket 耗尽重连 |

---

## 8. 安全与风控注意

- Noise 通道有 **remote attestation / notary endorsement**；Shared Agent 路径校验更严。
- 控制面有 TLS/代理指纹敏感点（本环境曾需关掉「本机路由」才能打开 muse.ai）。
- 不要把 `auth_token` / `access_token` / netlog 原文提交到 git。
- `/api/falco` 会上报大量客户端行为，BotHub 自动化应注意频率。

---

## 9. 缺口（已知但未在明文中完整展开）

1. **Noise 载荷明文样本**：网线抓到的是密文；方法与字段来自 JS 反推。若要完整 JSON schema，需在页面上下文 hook `sendRequest` 或完成 Noise 解密。
2. **memory.* 请求/响应字段**：注册表有，未见调用体。
3. **connectors.list 的 GitHub 条目完整结构**：账号已连接，但列表在 Noise 内。
4. **protobuf 完整 .proto**：需从 JS 的 `@bufbuild`/`encode` 定义继续还原（已确认存在 HttpRequest / StreamFrame / ServiceEnvelope / NoiseFrame）。

---

## 10. 文件清单

```
museai/
  protocol.md              ← 本文件
  muse_client.py           ← 控制面 + 协议草图（不含可用 Noise 实现）
  samples/
    gateway_methods.json   ← 387 个 RPC
    auth_check_response.redacted.json
    chat_stream_request.example.json
    approval_decide_request.example.json
    vm_lease_response.example.json
    homepage_bootstrap_redacted.txt
    README.md
  js/                      ← 前端 chunk（协议逆向用）
```

含凭证的 `museai-netlog-*.json` 在分析结束后删除。

## 附：嵌入式“空白页”根因与恢复（2026-11-03）

- 现象：BotHub 中 muse.ai 已登录但 body 为空、无 `__hatch_store__`、hook 卡在 `dom`。
- 根因：**不是 VM/登录失效**。SSR 为 RUNNING（`vmState:"RUNNING"`）。React 流式 Suspense 的 reveal（`$RC`→`$RB`→`$RV`）放在 `requestAnimationFrame` 里；未 attach 的 WebContentsView 是 `visibilityState=hidden`，rAF 不触发 → 永不 hydrate → 网关客户端不启动。
- 每台 VM 的 `wss://<vmId>.metaaivm.com/` 公网 DNS 为 NXDOMAIN 属正常；客户端实际走 `wss://hatch.metaaivm.com/v1/noise?vm_id=…`（可连通）。
- 官方恢复路径（HatchVmWakeRecovery）：`POST /api/hatch/vm/wake` body `{vm_id, retry_count, connect_attempt_id?}`；`lease-vm` body `{vmType:"standard"|"confidential"}`（confidential=cvm_disabled）；`reset-vm` body `{fqdn, switchTo}`。
- BotHub 修复：`backgroundThrottling:false` + CDP `Emulation.setFocusEmulationEnabled` / `Page.setWebLifecycleState active` 保活；watchdog 冲刷 `$RB`、按退避调用 vm/wake、超时 reload。
