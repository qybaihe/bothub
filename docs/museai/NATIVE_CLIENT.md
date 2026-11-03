# Muse native Noise client — implementation brief for BotHub

**Audience:** Claude (BotHub) implementing a main-process Node/Electron client.  
**Goal:** Stable `chat.stream` send + live streaming **without** WebContentsView `sendRequest` hooks.  
**Do not** commit raw cookies / auth_token / notary_token. Redact in logs.

Companion deep dive: `protocol.md`. Protos: `samples/proto/`. Stream shapes: `samples/stream/`.

---

## Why the embedded path is unstable (fix this first)

Evidence from BotHub `src/main/muse/*` + muse.ai JS:

| Failure | Cause | Evidence |
|---|---|---|
| Messages fail to send | Hook never finds page `sendRequest` → falls to DOM composer | `hookScript.ts` scans React fiber/webpack; official client does **not** put `sendRequest` on `window` |
| Hook lost after nav / reload | `did-finish-load` reinstalls hook, but gateway may not be up yet; cold start up to ~600s rediscover | `hookScript.ts` interval; `museSessionManager.installHook` |
| Gateway never boots | Detached/hidden `WebContentsView` → `visibilityState=hidden` → SSR `$RC`/`$RV` rAF never runs → React never hydrates | `museKeepAlive.ts` comment + CDP focus/lifecycle hack |
| Streaming “drops” | BotHub treats `chat.stream` ack as done, then **polls `chat.history`** instead of consuming the subscription NDJSON on the same Noise stream | `museSessionManager.chatStreamAndCollect` |
| Wrong request shape | `capabilities: {}` (object) and `node_id: accountId` | Official: `capabilities: string[]`, `node_id: deviceContext.local.deviceId` (`0nq-jlgnc05xv.js`) |
| WS/Noise death | Decrypt/encrypt error poisons transport; close `4004`/`4005`; heartbeat timeout `4002` | `1ffa2q4wayepu.js` |
| Auth flake | `auth_token` (`s0:` JWT) expires; needs `/api/hatch/token` refresh + full Noise re-handshake | control plane + reconnect in `3elf2yytnj4zr.js` |

Native client removes hook/DOM/hydration from the critical path.

---

## Architecture (main process)

```
[cookies hatch_sess/gw/vml]
        │
        ▼
 MuseControlPlane (HTTPS muse.ai)
   auth/check → wake → lease-vm → token → noise-notary-token
        │
        ▼
 wss://hatch.metaaivm.com/v1/noise?vm_id&auth_token&notary_token&app_id=hatch-web&request_id
        │
        ▼
 Noise_XX_25519_AESGCM_SHA256 handshake (initiator)
        │
        ▼
 HTTP-over-Noise RPC (protobuf ServiceFrame)
   chat.stream (subscription NDJSON)
   chat.subscribe / chat.history / chat.cancel
   egress.approvals / egress.approval.decide  (service=sentinel)
   sessions.list / connectors.list / …
```

Keep a **thin** login WebContentsView only for OIDC cookie bootstrap (user login + 2FA). After cookies exist in the persist partition, **all chat I/O is native**.

---

## Phase plan

### P0 — Control plane (already sketched)

Port `/workspace/muse/museai/muse_client.py` to TS:

1. Read cookies from account partition (`hatch_sess`, `hatch_gw`, `hatch_vml`, …).
2. `POST /api/auth/check` → viewer_id (sanity).
3. `POST /api/hatch/vm/wake` then `POST /api/hatch/lease-vm` `{vmType}` if needed.
4. `POST /api/hatch/token` `{vmAddress, vmName}` → `token` (`s0:…`).
5. `POST /api/hatch/noise-notary-token` `{vmName}` → `notaryToken` (`endorsement.v1.…`).
6. Build WS URL (see protocol.md §3.1). Refresh token on `auth_failed` / 401-ish closes.

### P1 — Noise transport (critical)

**Do not** invent a new handshake. Port the algorithm from `js/2iv-bzae6ju_t.js` (CipherState / SymmetricState / HandshakeState / NoiseTransport).

Libraries:

- Prefer **hand-port** of that file to Node (WebCrypto via `crypto.webcrypto` or `@noble/curves` X25519 + Node `crypto` AES-GCM).  
- `@noise-protocol` / `noise-protocol` npm packages are incomplete for this exact XX+custom payloads; only reuse if you verify byte-identical vectors.
- Protobuf: `@bufbuild/protobuf` or `protobufjs` with `samples/proto/*.proto`.
- WS: `ws` package in main process.
- Optional zstd: `fzstd` / `@mongodb-js/zstd` for request bodies ≥1KiB (`Content-Encoding: zstd`). First ship **without** compression (server accepts plain JSON).

Handshake initiator (standard `hatch_vm`, non-CVM):

1. `initialize()` prologue `Noise_XX_25519_AESGCM_SHA256`.
2. Msg1 = `e` ‖ `encryptAndHash(payload)`.  
   - Personal VM: payload = freshness client nonce encoded by Hatch helper (32+ random OK to start; match JS `(0,s.r)/(0,s.S)` when bringing up CVM).  
   - Shared-agent path: protobuf field2=int32(1) — skip for BotHub personal accounts.
3. Wait binary WS msg2; `readMessage2`.
4. If msg2 payload parses as Owner RV challenge → **CVM path** (needs recovery key in IndexedDB). For BotHub v1: detect + surface error “open muse.ai once to enroll CVM / use non-confidential VM”, do not invent keys.
5. Else treat payload as attestation bundle; **v1 policy:** accept `Platform.NON_TEE` with valid `auth_token` binding; optionally verify notary endorsement later. SEV-SNP full verify is P3.
6. Msg3 = `writeMessage3(empty)` for standard personal VM.
7. `split()` → sendCipher / recvCipher. AES-GCM AD = **empty**. IV = 12 bytes, nonce u64 BE in bytes 4..11.

Frame each ciphertext as one WS binary message = `encrypt(NoiseTransportFrame)`.

### P2 — HTTP-over-Noise RPC

For each call:

```
streamId = ++counter (int64, start at 1)
ApplicationRequest{verb, path, headers, body=utf8(JSON.stringify(params)), end_body=true}
ServiceFrame{stream_id, request}
ServiceRequest{service: DAEMON|SENTINEL|…, payload: encode(ServiceFrame)}
chunk into NoiseTransportFrame (max payload 65489; random chunk_id)
encrypt each chunk with sendCipher → ws.send
```

Default headers:

- `Content-Type: application/json` (non-GET with body)
- `x-request-id: <uuid>`
- `x-app-id: hatch-web`
- `Accept-Language: en-US`

GET: params → query string; empty body.  
`service` map: `daemon=0`, `sentinel=1`, `vault=2`, `authd=3`, `ssh_access=4`.

Inbound: decrypt → reassemble chunks → `ServiceResponse` → `ServiceFrame`:

- `response` → status/headers/body; if subscription, keep stream open for `body_chunk`
- `body_chunk` → append; NDJSON line split on `\n`
- `reset` → fail pending promise

### P3 — chat.stream (send + stream)

Request:

```json
{
  "items": [{"type": "text", "text": "<user text>"}],
  "node_id": "<stable device uuid per BotHub account partition>",
  "session_id": "<optional existing thread>",
  "capabilities": []
}
```

- Method `chat.stream`, `POST /chat/stream`, `noiseOnly`, **`streamMode: subscription`**, service `daemon`.
- Promise/ack = first JSON object on the body that is **not** `{type:"event"}` → `{message_id, session_id, reply_to_message_id?}`.
- Keep reading NDJSON `type:"event"` lines on the **same** stream_id until reset/end or you cancel.

Handle at least:

| event_name | UI action |
|---|---|
| `message.user` | confirm user turn |
| `delta.message_start` | create assistant stub, streaming=true |
| `delta.text_append` | append `payload.text` |
| `delta.message_done` / `message.assistant` | finalize text, streaming=false |
| `delta.tool_start` / `delta.tool_done` | optional tool chip |
| `delta.placeholder` / `delta.presentation` | ignore or map later |

Emit BotHub `message_delta` / `message` from these events — **do not** poll `chat.history` for streaming (history is fine for backfill only).

Also implement:

- `chat.cancel` when user stops generation
- `chat.subscribe` if you want push without sending (optional)
- `sessions.list` / `session.start` for thread list
- `egress.approvals` + `egress.approval.decide` (`service=sentinel`) for Attention bar — shapes already in `samples/approval_*.json`

### P4 — Reconnect

Mirror official client (`3elf2yytnj4zr.js`):

- Heartbeat: every **30s** call gateway `connection.ping` (or equivalent health RPC); timeout **10s** → close 4002.
- Backoff delay: for attempt `e`, trust flag `t`:  
  `e < 40*t ? 1000 : round(min((t?1000:200)*1.5^max(0,e-40t), 8000) * (1+0.2*random))`  
  Auth failures: slow retry **30s**, pause while `document.hidden` equivalent (app suspended).
- On reconnect: new WS + full Noise handshake + new `auth_token` if needed; **re-subscribe** chat.subscribe / replay pending send queue.
- Poisoned cipher (`NoiseTransport: dead`) ⇒ hard reconnect, never reuse ciphers.

---

## Suggested module layout (BotHub)

```
src/main/muse-native/
  controlPlane.ts      # HTTPS muse.ai
  noise/
    x25519.ts
    cipherState.ts     # AES-GCM + HKDF-SHA256
    handshake.ts       # Noise_XX
    transport.ts       # encryptHttpRequest / decryptFrame / chunking
  protos/              # generated from samples/proto
  rpc.ts               # method registry + unary/subscription
  chat.ts              # chat.stream event state machine
  reconnect.ts
  index.ts             # MuseNativeGateway implements adapter surface
```

Replace `MuseSessionManager.rpcRaw` / `chatStreamAndCollect` with `MuseNativeGateway` once P3 works. Keep WebContentsView for login + optional “Open web session”.

---

## Acceptance tests

1. Cold start with valid cookies → Noise connected < 15s (VM already RUNNING).
2. `chat.stream` “ping” → ack with `message_id` + ≥1 `delta.text_append` + `delta.message_done` within 60s.
3. Kill WS mid-stream → reconnect → next send succeeds; no permanent hook/DOM fallback.
4. `egress.approvals` returns array (maybe empty) without page hook.
5. No secrets in git; tokens only in memory / safe Electron safeStorage if persisted.

---

## Out of scope / hard stops

- Do **not** extract Keychain / sand-secrets / CVM recovery keys from the user’s browser profile.
- Do **not** ship a cracked SEV-SNP verifier that accepts forged attestations for shared-agent.
- Confidential VM (`owner_rv_challenge` / chip binding): show actionable error; user opens muse.ai once, or BotHub stays on `hatch_vm` NON_TEE.

---

## File checklist to read while coding

1. `protocol.md` §3–§4 (this repo)
2. `js/2iv-bzae6ju_t.js` — Noise + framing (source of truth)
3. `js/1ffa2q4wayepu.js` — sendHttpRequest / NDJSON subscription
4. `js/2a5inne9oca8a.js` — WS URL builder
5. `js/3elf2yytnj4zr.js` — reconnect / heartbeat
6. `js/21rnprfgq7_go.js` — `event_name` switch
7. `samples/gateway_methods.json` — 387 methods
8. `samples/proto/*.proto`
9. `samples/stream/*`

