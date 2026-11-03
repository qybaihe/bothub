# Meta Muse（muse.ai / Hatch）协议分析（深度版）

> 来源：Chrome net-export（已删）+ 前端 JS（`museai/js/`、`museai/js_allow/`，尤其 `2iv-bzae6ju_t.js` / `1ffa2q4wayepu.js` / `2a5inne9oca8a.js` / `3elf2yytnj4zr.js` / `21rnprfgq7_go.js` / `139ad6to7j8dj.js`）。  
> 录制账号：`<redacted-email>`。时间约 2026-11-03（Asia/Singapore）。  
> **所有 token / cookie / OIDC code 已脱敏。** Noise 线上仍为密文；RPC/事件形状由 JS 还原。  
> 原生实现说明见 **`NATIVE_CLIENT.md`**。`.proto` 见 `samples/proto/`。流式样例见 `samples/stream/`。

---

## 0. 一句话结论

**真正的 Meta Muse 是 https://muse.ai（Hatch），不是 https://www.meta.ai。**

```
浏览器/BotHub
  ──HTTPS──► muse.ai          控制面：OIDC、cookie、租 VM、auth_token、notary
  ──WSS────► hatch.metaaivm.com/v1/noise
                Noise_XX_25519_AESGCM_SHA256
                └─ HTTP-over-Noise RPC（protobuf）
                   ├─ chat.stream（subscription + NDJSON 事件）
                   ├─ connectors.* / memory.* / session.*
                   └─ egress.*（service=sentinel）
```

发消息与流式回复**全部**走 Noise 上的网关 RPC。BotHub 现有「内嵌页 + hook `sendRequest` / DOM」路径不稳定（见 §11）；应用 **main-process 原生 Noise 客户端**（`NATIVE_CLIENT.md`）。

---

## 1. 与 www.meta.ai 的差异

| | **muse.ai（Hatch）** | **www.meta.ai** |
|---|---|---|
| 主聊天 | `wss://hatch.metaaivm.com/v1/noise` | `wss://gateway.meta.ai/ws/clippy` |
| 加密 | Noise_XX + AES-GCM + protobuf | DGW 二进制 + protobuf-in-JSON |
| Cookie | `hatch_sess` / `hatch_gw` / `hatch_vml` | `ecto_1_sess` |
| 发消息 | `chat.stream` | clippy OPEN_STREAM + DATA |
| 待确认 | `egress.approval.decide` | 无同等 Sentinel |

---

## 2. 认证（OIDC + Cookie + VM Token）

### 2.1 OIDC（抓包已录全）

`GET /api/oidc/start` → `auth.meta.com/oidc`（app_id=`1302642031697155`，PKCE S256，redirect `https://auth.muse.ai/oidc/muse/`）→ `muse.ai/oidc/callback` → `/access` → `/`。

### 2.2 Cookie（`.muse.ai`）

| Cookie | 作用 |
|---|---|
| `hatch_sess` | 主会话 |
| `hatch_gw` | 网关 |
| `hatch_vml` | VM 租约 |
| `hatch_<redacted>*` | 登录过渡 |

### 2.3 控制面 RPC（HTTPS，可 cookie 调用）

| 调用 | 结果 |
|---|---|
| `POST /api/auth/check` | `{ok, access_token, session_binding_id, viewer_id, outcome}` |
| `POST /api/hatch/vm/wake` | `{status:"wake_requested"}` |
| `POST /api/hatch/lease-vm` `{vmType}` | `{status:"assigned", gatewayUrl, vmName, vmId}` |
| `POST /api/hatch/token` `{vmAddress, vmName}` | `{token:"s0:<JWT>", notary_token?}` |
| `POST /api/hatch/noise-notary-token` `{vmName}` | `{notaryToken:"endorsement.v1.…"}` |

首页 RSC bootstrap 常已带 `gatewayUrl` / `vmName` / `authToken` / `noiseNotaryToken`（`vmState:RUNNING`）。

草图：`muse_client.py`。

---

## 3. Noise 传输层（深度）

### 3.1 WebSocket URL

前端把 `wss://<vmId>.metaaivm.com/` 规范成：

```
wss://hatch.metaaivm.com/v1/noise
  ?vm_id=<vmId>
  &auth_token=<s0:JWT>
  &notary_token=<endorsement.v1.…>   # 可选但官方会带
  &app_id=hatch-web                  # NEXT_PUBLIC_ABRA_APP_ID 默认
  &request_id=<uuid>
```

源码：`js/2a5inne9oca8a.js`（`hatch.metaaivm.com` + `/v1/noise`）。  
**身份在 query 的 JWT/notary**；Noise 负责信道加密与（可选）远程证明绑定。Cookie **不**直接出现在 WSS 握手里。

### 3.2 密码套件

- 模式：**Noise_XX_25519_AESGCM_SHA256**（initiator = 客户端）
- DH：X25519（WebCrypto，失败则 libsodium）
- AEAD：AES-GCM，tag 128-bit，**AD = 空字节**
- Nonce：12 字节 IV；计数器放在 **大端 u64于 offset 4..11**（前 4 字节为 0）
- HKDF：HMAC-SHA256，Noise 标准 `HKDF(ck, ikm) → ck', k`
- 拒绝明文 WS 帧（连接建立后）

实现真相来源：`js/2iv-bzae6ju_t.js`（`CipherState` / `SymmetricState` / `NoiseXX` / `NoiseTransport`）。

### 3.3 握手消息（initiator）

| 步 | 内容 |
|---|---|
| Init | `h = ck = pad32("Noise_XX_25519_AESGCM_SHA256")`；`mixHash(empty)` |
| → Msg1 | `e`（32B 公钥）‖ `encryptAndHash(payload1)` |
| ← Msg2 | `re`(32) ‖ `decryptAndHash(rs‖tag)` ‖ `decryptAndHash(payload2)`；中间两次 `DH(e,re)` / `DH(e,rs)` → `mixKey` |
| → Msg3 | `encryptAndHash(s)` ‖ `encryptAndHash(payload3)`；`DH(s,re)` → `mixKey` |
| Split | `HKDF(ck, empty) → k_send, k_recv`；清零握手状态 |

**payload1（Msg1）**

- 个人 VM：客户端 freshness nonce（JS `(0,s.r)` + `(0,s.S)` 编码）。
- Shared Agent：protobuf `Writer.uint32(16).int32(1)`（field 2 = 1），无 nonce。

**payload2（Msg2）**

- 能解成 Owner RV challenge → `observed_type = confidential`（CVM）：需要 IndexedDB recovery key / chip binding。BotHub v1 **不要硬解**，应报错引导用户用网页完成 enroll 或使用普通 `hatch_vm`。
- 否则视为 attestation 原始字节 → `observed_type = standard`。Attestation bundle schema：`samples/proto/attestation_bundle.proto`（`NON_TEE` / `AMD_SEV_SNP`，`ReportDataInput{x25519_public_key, client_nonce}`）。

**payload3（Msg3）**

- 标准个人 VM：**空** `Uint8Array(0)`。
- CVM：RV proof（由 recovery key + notary 派生）。
- Shared Agent：fresh ticket bytes。

默认超时 **10s**；msg 长度上限 **65535**。

### 3.4 应用层帧（HTTP-over-Noise）

嵌套（外→内）：

```
WS binary
  = AES-GCM( sendCipher, AD="", plaintext = NoiseTransportFrame )
      NoiseTransportFrame { chunk_id, chunk_index, total_chunks, payload }
        payload = ServiceRequest { service, payload=ServiceFrame }   # 客户端→服务端
               或 ServiceResponse { payload=ServiceFrame }           # 服务端→客户端
          ServiceFrame {
            stream_id,
            oneof kind { request, response, body_chunk, reset }
          }
            ApplicationRequest  { verb, path, headers[], body, end_body }
            ApplicationResponse { status, headers[], body, end_body }
```

`.proto`：`samples/proto/noise_transport.proto`、`noise_envelope.proto`。

**分片规则**

- 每个 `NoiseTransportFrame.payload` ≤ **65489** 字节
- `total_chunks` ∈ [1, 256]；进行中的 assembly ≤ 16 个 `chunk_id`
- 单 assembly 总字节 ≤ **0x1000000**
- `chunk_id`：随机 int64

**stream_id**：客户端从 **1** 递增的 BigInt；每个 RPC 一个流。

**ServiceType**：`daemon=0`（默认）、`sentinel=1`、`vault=2`、`authd=3`、`ssh_access=4`。

### 3.5 HTTP 语义如何编码

源码：`encryptHttpRequest` / `#V` in `2iv-bzae6ju_t.js`；调用方 `1ffa2q4wayepu.js`。

- 非 GET 且 `requestBody≠empty`：`body = UTF8(JSON.stringify(params))`
- GET：params → query string；body 空
- 默认头：
  - `Content-Type: application/json`（有 JSON body 时）
  - `x-request-id: <uuid>`
  - `x-app-id: hatch-web`
  - `Accept-Language: en-US`（或页面 locale；`es-la`→`es-419`）
- 可选：body ≥ 1024B 时 zstd（`Content-Encoding: zstd`）；服务端若不支持会 415，客户端禁用压缩。原生 v1 可先不压。

Unary：`end_body=true` 一次 request。  
流式上传：`startStreamRequest`（`end_body=false`）+ `encryptBodyChunk`。  
取消：`encryptReset` → `Reset{code:CANCELLED}`。

### 3.6 订阅 / NDJSON

`chat.stream` / `chat.stream_events` / `chat.subscribe` / `activity.subscribe` 等注册为  
`streamMode:"subscription"`（`139ad6to7j8dj.js`）。

行为：

1. 先收到 `ApplicationResponse`（HTTP status + 可选初始 body）。
2. 同一 `stream_id` 上继续 `body_chunk`，按 **NDJSON**（`\n` 分隔）解析。
3. 第一个**非** `{type:"event"}` 的 JSON 对象 = **RPC ack**（对 `chat.stream` 即 `message_id` / `session_id`…）。
4. 之后每行 `{type:"event", event_name, message_id, seq, occurred_at_ms, payload, …}` 推给订阅分发器。

解密错误 → transport poison → WS close **4004**；reset 发送失败 → **4005**；`chat.subscribe` 失败 → **4008**。

---

## 4. chat.stream

### 4.1 请求

```json
{
  "items": [{"type": "text", "text": "hello"}],
  "node_id": "<deviceId>",
  "session_id": "<optional thread id>",
  "capabilities": [],
  "hidden_prompt": null,
  "client_ip": null,
  "timezone": null,
  "metadata": null,
  "product_request": null
}
```

- `POST /chat/stream`，`noiseOnly`，service=`daemon`
- 额外头常带业务侧 `x-request-id`（与默认头合并）
- **`capabilities` 是数组**，不是 `{}`（BotHub 旧适配器曾误传对象）

### 4.2 Ack

```json
{
  "message_id": "<accepted user message id>",
  "session_id": "<thread session id>",
  "reply_to_message_id": "<optional>"
}
```

样例：`samples/stream/chat_stream_ack.example.json`。

### 4.3 流事件（`event_name`）

前端 reducer：`js/21rnprfgq7_go.js`。完整 NDJSON 示例：`samples/stream/chat_stream_events.example.ndjson`。

| event_name | 含义 |
|---|---|
| `message.user` | 用户消息落库 |
| `message.assistant` | 助手完整消息（可与 delta 并存） |
| `delta.message_start` | 开始流式助手消息 |
| `delta.text_append` | `payload.text` 增量拼接 |
| `delta.message_done` | 流式结束；`payload.content` / `display_text` 为终稿 |
| `delta.tool_start` / `delta.tool_done` | 工具调用 |
| `delta.placeholder` / `delta.presentation` | UI 占位/富呈现 |
| `tool_call.started` / `tool_call.completed` | 工具状态 |

信封字段：`type:"event"`、`event_name`、`message_id`、`seq`、`occurred_at_ms`、`display_text`、`payload`、`resources`、`author`。

内部 perf 标记（非 wire）：`DELTA_MESSAGE_START` / `DELTA_FIRST_TEXT` / `DELTA_TEXT_APPEND` / `DELTA_MESSAGE_DONE`。

**稳定流式的正确做法**：消费 `chat.stream` 同一 subscription 的 NDJSON；**不要**只靠轮询 `chat.history`（BotHub 现状，导致“流式断掉/丢字”）。

### 4.4 取消 / 历史

- `chat.cancel` `POST /chat/cancel`
- `chat.history` / `chat.history_window` — 回填；history 响应里可有 `chat_events[]`（同 `event_name`）
- `sessions.list` / `session.*`

---

## 5. 网关方法目录

完整 387 个：`samples/gateway_methods.json`。

核心：

| method | HTTP | path | 备注 |
|---|---|---|---|
| chat.stream | POST | /chat/stream | subscription |
| chat.stream_events | POST | /chat/stream-events | subscription |
| chat.subscribe | POST | /chat/subscribe | subscription，timeout 30s |
| chat.cancel | POST | /chat/cancel | noiseOnly |
| chat.history | GET | /chat/history | |
| sessions.list | GET | /api/session/list | |
| egress.approvals | GET | /approvals | **service=sentinel** |
| egress.approval.decide | POST | /approvals/{id}/decide | sentinel |
| connectors.list | GET | /connectors | |
| memory.search | POST | /memory/search | |
| activity.subscribe | POST | /activity/subscribe | subscription |

Sentinel decide / 列表形状：`samples/approval_*.json`（前文 Allow 抓包已还原）。

---

## 6. 重连与心跳

源码：`js/3elf2yytnj4zr.js`。

- **Heartbeat**：每 **30s** probe；**10s** 超时 → `close(4002,"heartbeat timeout")`
- **Backoff**：`delay(attempt e, trusted t)` =  
  `e < 40*t ? 1000 : round(min((t?1000:200)*1.5^max(0,e-40t), 8000)*(1+0.2*random))`
- Auth 失败：slow retry **30s**；页面 `hidden` 时推迟
- 重连 = 新 WS + **完整 Noise 握手** +（必要时）刷新 `auth_token`
- Cipher/transport poison 后禁止复用，必须新握手

---

## 7. 远程证明 / 设备绑定

| 层级 | 作用 |
|---|---|
| `auth_token` | 网关鉴权（租约 JWT） |
| `notary_token` | endorsement，配合 attestation 校验镜像/节点 |
| Noise XX 静态密钥 | 绑定本次传输；msg2 可带 attestation |
| CVM recovery key | IndexedDB；仅 confidential VM / Owner RV |
| `session_binding_id` | 控制面 `auth/check` 返回 |

原生客户端 v1：**标准 `hatch_vm` + NON_TEE attestation（可先宽松校验）+ 有效 auth/notary token**。  
不要从 Keychain/浏览器配置挖 recovery key。

---

## 8. 控制面其它 HTTP

`/api/falco` 埋点可忽略；`/api/hatch/invite`、`stateful-sharing`、`reset-vm`、checkout Stripe 等见旧版清单。TLS/指纹敏感：部分环境需关「本机路由」才能打开 muse.ai。

---

## 9. 状态灯建议

| BotHub | 信号 |
|---|---|
| Idle | Noise 已连接且无 stream / 无 pending approval |
| Running | 有未完成 `chat.stream` subscription 或 activity |
| Action Required | `egress.approvals` 非空 / `pending_user_confirmation` |
| Error | 握手失败、auth rejected、重连耗尽、CVM enroll 必需 |

---

## 10. 安全

- 禁止把 netlog、`auth_token`、cookie 提交 git
- 文档与日志脱敏（本仓库已做）
- Shared Agent / SEV-SNP 路径校验更严；伪造 attestation 不可接受

---

## 11. 为何内嵌 `sendRequest` 不稳定（对照 BotHub 代码）

| 问题 | 机制 |
|---|---|
| 发不出去 | `hookScript.ts` 靠扫 React fiber；官方不把 `sendRequest` 挂 `window`；发现失败就 DOM |
| 流式丢 | `museSessionManager.chatStreamAndCollect` 只取 ack，再轮询 `chat.history`，**不读 subscription NDJSON** |
| 页面空白 / hook 永不上 | 隐藏 `WebContentsView` → `visibilityState=hidden` → SSR rAF 不跑（`museKeepAlive.ts`） |
| 导航丢 hook | `did-navigate` / reload 后 gateway 冷启动；rediscover 有窗口期 |
| WS 断 | 心跳/解密 poison；内嵌页重连与 BotHub 发送队列不同步 |
| 参数错 | `capabilities:{}`、`node_id=accountId` 与官方不符 |

→ 结论：聊天路径改为 **原生 Noise**（`NATIVE_CLIENT.md`）；WebContentsView 仅保留登录与“打开网页”。

---

## 12. 缺口

1. Owner RV challenge 完整 `.proto` 与 proof 字节格式（CVM）— v1 可避让  
2. `connection.ping` 的精确 method 名（心跳实现时可从方法表/再 hook 一次确认）  
3. Msg1 freshness nonce 的精确 protobuf 字段号 — 对接 CVM 前对齐  
4. 无明文 Noise 抓包（密钥在浏览器内存）；联调靠官方页对照或自建向量

---

## 13. 文件清单

```
museai/
  protocol.md           ← 本文件
  NATIVE_CLIENT.md      ← Claude/BotHub 实现简报
  muse_client.py        ← 控制面草图
  samples/
    gateway_methods.json
    proto/              ← noise_*.proto, attestation_bundle.proto
    stream/             ← chat.stream ack + NDJSON 示例
    approval_*.json
    chat_stream_request.example.json
    …
  js/                   ← 前端 chunk（协议逆向源）
```
