# Muse / Hatch protocol gaps vs BotHub

> Source: `samples/gateway_methods.json` (387 RPCs) + frontend JS (`js/1xb3yb2v9z58-.js`, `0nq-jlgnc05xv.js`, `3fiky3z_50g3-.js`, `00z4km9l8x5ty.js` / `0wy3rr-t8mqid.js`, `2a5inne9oca8a.js`, `139ad6to7j8dj.js`).  
> Date: 2026-11-03 (Asia/Shanghai). Tokens/cookies/invite codes **redacted**.  
> No live Noise capture for peers/shared_agents in this pass — wire shapes from JS contracts + method table. Confidence tagged per section.

## 0. BotHub already covered (baseline)

| Area | How | Notes |
|---|---|---|
| Noise transport + `chat.stream` | native | P0–P3 e2e |
| Approvals (`egress.approvals` / `decide`) | native | sentinel |
| Sessions list/rename/pin/archive/delete | native UI | must-have |
| Files (`fs.*` list empty-state) | native UI | must-have |
| Connectors list/connect/disconnect UI | native | OAuth not fully e2e'd |
| Quota | HTTPS `fetchSubscriptionAction` | not Noise |
| Schedules (`tasks.*`) | native | create via chat only |
| Hatch invite badge / copy | HTTPS + UI | product invite, ≠ Trusted Network peers |
| Add-account login | WebContentsView | signedIn-before-reload fix |

**Not covered** below. Gateway still has ~300+ methods unused by BotHub.

---

## 1. Cross-account / bot-to-bot messaging  **[USER PRIORITY]**

Muse exposes **three related but different** cross-account surfaces. BotHub has **none** of them wired.

### 1.A Trusted Network — `peers.*` (26 methods)  confidence: **high** (JS contract + method table)

Official UI name: **Trusted Network** (settings). This is Muse↔Muse pairing between **personal Muse identities** (`muse_id`), not Meta Messenger.

**Capability discovery:** `GET /peers/status` → `peers.status`  
Contract `contract_version:1` fields (parsed in `1xb3yb2v9z58-.js`):

| Field | Meaning |
|---|---|
| `supported` / `availability` (`enabled`/`disabled`/…) | Feature gate |
| `allowed_operations[]` | e.g. `list_contacts`, `list_invitations`, `list_issued_access`, `list_requests`, `create_invitation`, `accept_invitation`, `read_safety_code`, `confirm_safety_code`, `change_trust_preset`, `disconnect`, `share_peer_space`, … |
| `features.pairing` | SAS / safety-code pairing |
| `features.background_coordination` | Background peer coordination |
| `chat_pairing` (bool) | **Peer chat pairing enabled** when true |
| `invite_open` / `invite_inbox` | Open-link vs inbox delivery paths |
| `trust_presets` / `invite_presets` | `restricted` → `collaborator` → `trusted` ladders |
| `capability_catalog` | versioned capability descriptors |
| page limits | contacts/invites pagination |

**Core RPC map** (all `service=daemon`, `noiseOnly`):

| method | HTTP | path | Role |
|---|---|---|---|
| `peers.status` | GET | `/peers/status` | Feature + ops catalog |
| `peers.list` | GET | `/peers` | Contacts (paged; cursor) |
| `peers.update` | PATCH | `/peers/{muse_id}` | Trust preset / nickname etc. |
| `peers.disconnect` | DELETE | `/peers/{muse_id}?relationship_generation_id&relationship_revision&relationship_started_at_ms&request_expires_at_ms` | Tear down bond |
| `peers.reset_conversation` | POST | `/peers/{muse_id}/reset_conversation` | Reset peer chat thread |
| `peers.invites.create` | POST | `/peers/invites` | Create invite → returns `invite_id_b64`, `invite_b64`, `fragment`, expiry |
| `peers.invites.list` | GET | `/peers/invites` | Outbound invites |
| `peers.invites.open` | POST | `/peers/invites/open` | Open invite by `fragment` |
| `peers.invites.accept` | POST | `/peers/invites/accept` | Accept → `muse_id` + relationship ids |
| `peers.invites.delivery` | POST | `/peers/invites/{invite_id}/delivery` | Delivery status |
| `peers.invites.revoke` | DELETE | `/peers/invites/{invite_id}` | Revoke |
| `peers.inbox.list` | GET | `/peers/inbox` | Pending inbox deliveries |
| `peers.inbox.deliver` | POST | `/peers/inbox/deliver` | **Deliver invite into peer inbox** |
| `peers.inbox.decline` | POST | `/peers/inbox/decline` | Decline `{delivery_id}` |
| `peers.requests.list` | GET | `/peers/requests` | Incoming/outgoing pairing requests |
| `peers.requests.sas` | GET | `/peers/requests/{relationship_generation_id}/sas` | Read safety code (SAS) |
| `peers.requests.sas.confirm` | POST | `…/sas/confirm` | Confirm safety code |
| `peers.rules.list` / `set` / `delete` | GET/POST/DELETE | `/peers/{muse_id}/rules[/{rule_id}]` | Per-peer allow/deny instruction rules |
| `peers.connections.get` | GET | `/peers/connections/{connection_id}` | Connection + rules snapshot |
| `peers.activity.list` / `dismiss` | GET/POST | `/peers/activity[/{id}/dismiss]` | Peer activity feed |
| `peers.photo` / `peers.avatar` | GET | binary media | Profile images |
| `peers.discretion.write` | POST | `/fs/write` | Discretionary FS write (long timeout) |
| `grants.list` | GET | `/grants` | Issued access grants (used by Trusted Network “issued access” UI) |

**Known request bodies (from call sites):**

```json
// peers.inbox.deliver
{
  "delivery_id": "<id>",
  "invite_b64": "<base64 ≤4096, len%4==0>",
  "sender_display_name": "<optional>",
  "expires_at": <ms>
}
// response status parsed as "delivered" | refused(4xx) → decline

// peers.inbox.decline
{ "delivery_id": "<id>" }

// peers.activity.list
{ "limit": 50 }

// peers.rules.list
{ "muse_id": "<id>" }

// peers.connections.get
{ "connection_id": "<id>" }

// peers.disconnect query (validated shape)
{
  "muse_id": "...",
  "relationship_generation_id": "<uuid>",
  "relationship_revision": <int>=1,
  "relationship_started_at_ms": <ms>,
  "request_expires_at_ms": <ms>  // must be > started
}
```

**Invite create response shape (parsed):**  
`create_request_id`, `relationship_generation_id`, `relationship_started_at_ms`, `request_expires_at_ms`, `invite_id_b64` (22-char), `invite_b64`, `fragment` (URL fragment for `invitation_url`), `expires_at_ms`, optional `owner_photo_jpeg_b64`.

**Accept flow:** open by `fragment` → accept → optional SAS read/confirm (`ceremony_id`, `confirm_request_id`) → contact status `verified`.

**How “bots talk” here:** After pairing + `chat_pairing`, Muse treats the peer as a Trusted Network contact; conversation reset via `peers.reset_conversation`. Exact chat wire may still reuse ordinary `chat.stream` with peer session metadata — **not fully proven** (confidence medium). Live e2e needed: create invite on account A, accept on B, send message, watch stream.

### 1.B Shared Agents — `shared_agents.*` (15 methods)  confidence: **high** (list/detail/shares); **medium** (remote send body)

Shareable agent definitions owned by one account, granted to others.

| method | Notes |
|---|---|
| `shared_agents.capabilities` | Feature flags: `shared_agents`, `canonical_sessions`, `presentation_identity`, `scope_manifest_v1`, `capability_descriptors`, `lifecycle`; remote needs `remote_grant_v1` + HTTP routes incl. `/shared-agents/remote/open|send` |
| `shared_agents.list` / `detail` / `create` / `delete` / `state.update` / `identity.update` | CRUD; list ≤25 |
| `shared_agents.definition` / `definition.update` | Instructions + `scope_manifest_version:1` + `scope_items` + `capability_descriptors` |
| `shares.list` / `create` / `revoke` / `conversation` | Share grants; create needs `invitation_request_id` + `invitation_secret_hash` |
| **`shared_agents.remote.open`** | `POST /api/shared-agents/remote/open`, **`noiseOnly`, `streamMode:"subscription"`, `connectionClass:"shared_agent"`** |
| **`shared_agents.remote.send`** | `POST /api/shared-agents/remote/send`, `noiseOnly`, `connectionClass:"shared_agent"` |

**Remote messaging events** (subscription NDJSON / event envelope, `2a5inne9oca8a.js`):

- `shared_agents.remote.message`
- `shared_agents.remote.closed` (payload has `reason`)

Send ack shape check: `{accepted:true, client_message_id, message_id}` with ids equal.

**Noise note:** Shared Agent connections use a **different Noise connection class** (`shared_agent`) and handshake payload variant already documented in `protocol.md` §3.3 (Msg1 field2=1, Msg3 ticket). BotHub native client today assumes personal `hatch_vm` — **must extend** for remote Shared Agent sessions.

JS comment path: `"Shared Agents are retired"` guard exists on some create paths — capabilities may report unsupported on some accounts. Probe `shared_agents.capabilities` first.

### 1.C Peer Spaces — `peerSpaces.*` (8) + `spaces.share*`  confidence: **medium**

Share a Space document/asset with a paired peer (`host_muse` + `slug` / `space_id`). Complements Trusted Network (`share_peer_space` in allowed_operations). Not DM chat; shared canvas/docs.

Also: `sharing.eligibility` / `sharing.attempt` (daemon, noiseOnly) — product “stateful sharing” gate (`samples/15_POST__api_hatch_stateful-sharing.txt` returned `{"enabled":false}` on test account).

### 1.D External channels (not Muse↔Muse)

| Prefix | Role | BotHub |
|---|---|---|
| `channels.*` | Link/unlink messaging channels | no |
| `whatsapp*` / `messenger*` | Companion link / unlock | no |
| `email.*` (19) | Muse mailbox for the agent | no |
| `foa.*` | Facebook/Meta FOA accounts | no |

These are **human chat apps ↔ Muse**, not BotHub multi-account routing.

### 1.E BotHub adaptation notes (cross-account)

1. **Product meaning for BotHub:**  
   - **Trusted Network** = connect two (or more) Muse accounts you manage so their agents can pair / chat / share spaces.  
   - **Shared Agents** = publish one agent definition and remote-message it from another account/session.  
   - **BotHub-local routing** (A’s chat result → B’s inbox without Muse peers) is **not** a Muse RPC — that would be BotHub orchestration only.

2. **Suggested BotHub MVP:**  
   - Per Muse account: Trusted Network panel → `peers.status` → list contacts/invites/inbox.  
   - Cross-account invite: Account A `peers.invites.create` → show URL/`fragment` or inbox-deliver to B’s pending → B accept + SAS confirm.  
   - Optional v2: Shared Agent create + `remote.open` subscription + `remote.send` (needs Shared Agent Noise class).  
   - Do **not** confuse with hatch product invite (`/api/hatch/invite`) already in quota/invite UI.

3. **Live samples still needed:** redacted `peers.status`, `peers.list`, invite create/accept, one `chat.stream` after pairing, `shared_agents.capabilities`.

---

## 2. Per-account proxy / network egress  **[USER PRIORITY]**

**Two layers — do not mix them.**

### 2.A BotHub client-side proxy (what the user asked)  confidence: **n/a (product), not a Muse RPC**

> “每个账号访问 Muse 可以单独配置一个代理”

This is **BotHub transport config**, not a Hatch method:

| Traffic | Must honor per-account proxy |
|---|---|
| HTTPS control plane | `muse.ai` OIDC, `/api/auth/check`, lease/wake/token, Server Actions (quota) |
| WSS Noise | `wss://hatch.metaaivm.com/v1/noise` (and any `*.metaaivm.com`) |
| Embedded login WebContents | session/partition proxy or `session.setProxy` |

**Adaptation notes:**

1. Store on each Muse account slot: `{ type: "http"|"socks5"|"socks5h"|none, host, port, user?, pass? }` in safeStorage.  
2. Native Noise client + `undici`/`fetch`/Node `HttpsProxyAgent` / `socks-proxy-agent` **bound per account connection manager** (today likely one global agent).  
3. Electron `session.fromPartition(persist:muse:<id>).setProxy({ proxyRules })` for login view.  
4. No Muse server API to “register” the proxy — pure client egress.  
5. Test matrix: different SOCKS for two accounts; verify distinct egress IPs via a connector/browser_task or external echo (careful with HITL approvals).

### 2.B Muse VM egress policy (protocol, different meaning)  confidence: **high**

Controls how the **Muse VM / Sentinel** reaches the internet (transparent proxy, MITM, host rules) — **not** BotHub’s path to muse.ai.

| method | Body (from JS) | UI meaning |
|---|---|---|
| `egress.permissions` | GET permissions snapshot | Includes `tproxy_mode`, `mitm_always_mode`/`mitm_mode`, `sni_rejection_mode`, HITL scopes |
| `egress.permissions.tproxy` | `PATCH { mode, actor?, reason? }` | **Transparent proxy**: “Allow DNS resolution and direct connections through the transparent proxy.” Modes: `enabled` \| `disabled` |
| `egress.permissions.mitm` | `{ mode, actor?, reason? }` | TLS interception |
| `egress.permissions.sni_rejection` | `{ mode, … }` | SNI rejection |
| `egress.permissions.network_rules` | PATCH `/permissions/network-rules` | Network allow/ask/deny rules (`kind` includes `network_rule`) |
| `egress.permissions.hitl` | connectors/network enabled + scopes (`only_chat` / `chat_crons_spaces`) | HITL master switches |
| `permissions.settings` / `update` | `connector_default`, `network_default`, `protocols[]` | Defaults `auto_allow` / `always_ask`; protocol rows mode `deny`\|`ask` |
| `egress.permissions.active*` / `revoke` / `reset` | Active grants; reset returns `{connector_overrides, network_rules}` counts | |

BotHub already uses **approvals** subset of egress; **tproxy / mitm / network_rules / settings** are unimplemented.

**When to expose in BotHub:** optional “VM network policy” advanced panel — **separate** from per-account client proxy. Label clearly: “Muse 出站策略” vs “BotHub 访问代理”.

---

## 3. Other unanalyzed / unimplemented areas

Confidence: **high** = method table + JS usage; **medium** = table + partial JS; **low** = table only.

| Area | Methods (count) | Confidence | BotHub status | Notes |
|---|---|---|---|---|
| **Trusted Network `peers.*`** | 26 | high | none | §1.A |
| **Shared Agents** | 15 | high/med | none | §1.B; remote needs shared_agent Noise |
| **peerSpaces / spaces.share** | 8+ | medium | none | Shared docs with peers |
| **Client proxy per account** | — | n/a | none | §2.A product work |
| **egress tproxy/mitm/network_rules/settings** | ~10 beyond approvals | high | partial (approvals only) | §2.B |
| **memory.*** | 4 (`get/search/consolidate/reindex`) | medium | none | Mentioned in protocol overview only |
| **goals.*** + `goal_prompt` | 7 | medium | none | Distinct from `tasks.*` schedules |
| **browser_task.*** / browser.* / browser_stream | 14+7+ | medium | none | Remote browser sessions; not schedules |
| **email.*** | 19 | medium | none | Agent mailbox |
| **voice.*** | 19 | medium | none | Calls, catalog, dictation, avatar video |
| **feed.*** | 16 | medium | none | Personalized feed units |
| **artifacts.*** beyond list | 11 | medium | list? | share/pin/slides/subscribe |
| **fs.*** beyond list | 14 | medium | list UI | read/write/search/subscribe |
| **credentials.*** (authd) | 10 | medium | none | Vaulted site credentials |
| **wallet.*** | 2 | high | intentionally skipped | Payment cards for checkout, **not** quota |
| **subscription.*** Noise | 2 | medium | quota via Server Action | redeem/callback secondary |
| **channels / whatsapp / messenger** | ~10 | medium | none | External chat companions |
| **subagents.*** | 2 | low | none | Nested agents status |
| **nodes.*** / `node.*` | ~8 | low | none | Device/node sync/invoke |
| **computer.*** | 3 | low | none | Computer-use surface |
| **shopping / hotels** | 6 | low | none | Commerce widgets |
| **podcasts / skills / widgets / pin / theme / ads / idea-cards** | scattered | low | none | Product surfaces |
| **config / identity / model / search / navigation / activity** | partial | medium | activity/approvals only | identity.subscribe useful for TN |
| **vm.health / enrollment_health** | 2 | medium | wake/lease only | Health probes |
| **ssh.* / vault.luks_status** | few | low | none | Operator/debug; redact aggressively |
| **redteam.*** | 4 | low | ignore | Internal mocks |
| **custom_connectors.*** | 3 | medium | none | User-defined connectors |
| **CVM Owner-RV / recovery key** | handshake | high (avoid) | error-only | Do not extract IndexedDB/Keychain |

---

## 4. Prioritized backlog (for Claude / BotHub)

### P0 — User-asked

1. **Per-account BotHub proxy** (§2.A): account settings UI + wire HTTPS+WSS+partition; e2e two accounts different SOCKS.  
2. **Trusted Network MVP** (§1.A): `peers.status` → list contacts/invites/inbox → create/accept invite (+ SAS if required) → show pairing state. Document live samples under `samples/peers/` (redacted).

### P1 — Cross-account messaging depth

3. Confirm whether paired peers chat via normal `chat.stream` or a dedicated path; implement peer conversation UI + `peers.reset_conversation`.  
4. **Shared Agents** probe `capabilities`; if `remote_grant_v1`, extend Noise `connectionClass=shared_agent`, then `remote.open` + `remote.send` + event UI.  
5. Optional: `peerSpaces.sharedWithMe.list` read-only.

### P2 — Egress / policy

6. Expose read-only VM network policy (`egress.permissions` snapshot: tproxy/mitm/sni).  
7. Optional toggles for tproxy/network_rules — behind “advanced”, copy Muse wording.

### P3 — Breadth

8. `memory.search` panel; `goals.list` (keep separate from schedules).  
9. `browser_task` viewer (lease/heartbeat/stop) — large.  
10. `email.mailbox.*` / `voice.*` / `feed.*` — product-dependent.  
11. Harden: `identity.subscribe`, `vm.health`, connector OAuth completion, Muse reload auto-connect leftover.

### Explicit non-goals (near term)

- Scraping CVM recovery keys / Keychain.  
- Using `wallet.*` as quota.  
- Pushing commits without user approval.  
- Treating hatch product invite as Trusted Network.

---

## 5. Suggested next live probes (on a throwaway Muse account)

```
peers.status
peers.list {limit}
peers.invites.list
peers.inbox.list
shared_agents.capabilities
shared_agents.list
egress.permissions          # snapshot tproxy/mitm
memory.search               # empty query / health
goals.list
```

Save redacted JSON under `samples/{peers,shared_agents,egress,memory,goals}/`.

---

## 6. File pointers

| File | Use |
|---|---|
| `samples/gateway_methods.json` | Full 387-method catalog |
| `protocol.md` / `NATIVE_CLIENT.md` | Noise + chat.stream |
| `QUOTA.md` / `SCHEDULES.md` | Covered quota + tasks |
| `js/1xb3yb2v9z58-.js` | Trusted Network contract |
| `js/0nq-jlgnc05xv.js` | inbox.deliver |
| `js/3fiky3z_50g3-.js` | Shared Agents |
| `js/00z4km9l8x5ty.js` / `0wy3rr-t8mqid.js` | egress permissions / tproxy |
| `js/2a5inne9oca8a.js` | shared_agents.remote events |
| `js/139ad6to7j8dj.js` | Method registry (connectionClass) |
