# Handoff → Claude：Muse 原生 Noise 客户端

## 用户诉求
muse 内嵌不稳定：**消息发不出去 + 流式回复断**。要深度逆向后写**不依赖 WebContentsView sendRequest** 的稳定客户端。

## 交付物（已 scp 到本机）
`~/projects/bothub/docs/museai/`

| 文件 | 用途 |
|---|---|
| **NATIVE_CLIENT.md** | 实现简报（按这个做） |
| **protocol.md** | Noise 握手/帧/RPC/事件/重连/为何 hook 不稳 |
| `samples/proto/*.proto` | NoiseTransport / ServiceFrame / Attestation |
| `samples/stream/*` | chat.stream ack + NDJSON 事件 |
| `samples/gateway_methods.json` | 387 RPC |
| `samples/approval_*.json` | Sentinel decide |
| `muse_client.py` | 控制面 HTTPS 草图 |

## 根因（对照现有代码）
1. `hookScript.ts` 扫不到稳定的 `sendRequest` → DOM。
2. `chatStreamAndCollect` **不读 subscription NDJSON**，只轮询 `chat.history` → 流式丢。
3. 隐藏 WebContentsView 导致 SSR/gateway 不 hydrate（`museKeepAlive` 只是止血）。
4. `capabilities:{}` / `node_id=accountId` 与官方不符。

## 你要做的
按 `NATIVE_CLIENT.md` P0→P3 在 **main process** 实现：
1. Cookie → wake/lease/token/notary  
2. Noise_XX（移植 `docs` 所述算法，源码参考箱内/文档指向的 JS）  
3. HTTP-over-Noise unary + **chat.stream subscription 事件**  
4. 重连/心跳；Sentinel approvals  

验收：cookie 有效时原生 `chat.stream` 能拿到 `delta.text_append`，WS 断开后重连仍可发。

## 禁区
不挖 Keychain / CVM recovery key；token 脱敏；未批准不 push。

## 优先级
Muse 原生传输 > 继续打磨 hook。Grok Bot sand-token 登录另线。
