# Muse / Hatch — full protocol map (BotHub)

> Generated 2026-11-04 (Asia/Shanghai); slice 80 matrix recount. Sources: official muse.ai JS (`docs` companions under `/workspace/muse/museai/js*`),
> `samples/gateway_methods.json` (387 Noise RPCs), archived redacted captures, BotHub `src/main/muse-native/*` + adapter.
> **No secrets / cookies / tokens.** Status: `done` | `partial` | `missing` relative to BotHub native path.

## 0. Stack (one glance)

```
Browser / BotHub
  HTTPS  muse.ai          control plane (OIDC, wake, lease, token, notary, quota/invite actions)
  WSS    hatch.metaaivm.com/v1/noise
           Noise_XX_25519_AESGCM_SHA256
           └─ HTTP-over-Noise protobuf RPC
              service: daemon | sentinel | vault | authd | ssh_access
              streamMode: unary | subscription (NDJSON) | records
```

Transport details: `protocol.md` + `NATIVE_CLIENT.md`. Protos: `samples/proto/`.

## 1. Control plane (HTTPS)

| Call | Status | Notes |
|---|---|---|
| `POST /api/auth/check` | **done** | OIDC session sanity |
| `POST /api/hatch/vm/wake` | **done** | Wake VM |
| `POST /api/hatch/lease-vm` | **done** | Lease VM |
| `POST /api/hatch/token` | **done** | auth_token s0:JWT |
| `POST /api/hatch/noise-notary-token` | **done** | notary endorsement |
| `GET/POST hatch invite / quota Server Actions` | **partial** | invite badge + quota UI |

## 2. Chat stream & subscribe

### 2.1 Send

- Method: `chat.stream` · `POST /chat/stream` · `subscription` · service `daemon`
- Official: ack only on this stream; **all events** arrive on long-lived `chat.subscribe`.
- BotHub: same (`muse-native/chat.ts`). Capabilities include `delta_stream`.

| Chat item shape | Status | Notes |
|---|---|---|
| `{"type":"text","text"}` | **done** | Default send |
| `{"type":"image","mime_type","data_base64","filename"}` | **done** | Composer reads ≤12MiB → chat.stream items |
| `{"type":"file","mime_type","data_base64","filename"}` | **done** | Non-image ≤12MiB inline base64 |
| `{"type":"file_ref","mime_type","path","filename"}` | **done** | Chunked `fs.write` (+ optional staging rename) via `uploadWorkspaceFile`; path `workspace/user/files/<safe>_<n>_<rand>.ext`; threshold non-image ≥10MiB / video ≥60MiB |

### 2.2 Stream / subscribe events

| event_name | Status | UI |
|---|---|---|
| `message.user` | **done** | Confirm user turn |
| `message.assistant` | **done** | Finalize assistant bubble |
| `delta.message_start` | **done** | Create streaming stub |
| `delta.text_append` | **done** | Append payload.text (needs delta_stream cap) |
| `delta.message_done` | **done** | Finalize; may carry transcript |
| `delta.presentation` | **partial** | Option + media + rich widgets (shopping/maps/html/slides/image_options RO); commerce write still N/A |
| `delta.placeholder` | **missing** | Ignored |
| `delta.tool_start / delta.tool_done` | **done** | Tool chips under assistant bubbles |
| `tool_call.started / tool_call.completed` | **done** | Same chip path as delta.tool_* |
| `agent.status` | **done** | Busy/idle/needs_approval → activity + status |

Other subscriptions in registry: `chat.stream_events`, `activity.subscribe`, `artifacts.subscribe`,
`computer.subscribe`, `fs.subscribe`, `tasks.subscribe`, `theme.subscribe`, `identity.subscribe`,
`navigation.subscribe`, `spaces.subscribe`.

### 2.3 Widgets

| kind | Status | Notes |
|---|---|---|
| `option` | **done** | Chip UI + widgets.state.set + resend label |
| `image / images` | **done** | http(s) inline; workspace paths via `fs.raw` preview (≤8MiB Range); honest chip if preview fails |
| `file / file_ref` | **done** | Inbound path chips; outbound image ≤12MiB / file ≤40MiB base64; ≥10MiB non-image → file_ref via `fs.write` |
| `image_options` | **partial** | RO grid + selection state; write/`widgets.state.set` for picks not wired |
| `shopping_cart / shopping_results(_v2)` | **partial** | Read-only product/cart UI; no checkout / shopping.* write |
| `local_map / marketplace_map` | **partial** | Read-only places/listings + sandboxed map html when present |
| `slides / html` | **partial** | Sandboxed html iframe; slides = label/slug/path chip |
| `audio / video` | **partial** | Parsed as file media chips (`audio/*` / `video/*`); no dedicated player |


### 2.4 Tool chips & media (BotHub)

| Surface | Status | Notes |
|---|---|---|
| `tool_call.*` / `delta.tool_*` → chat tool chips | **done** | Running/Done/Failed chips under assistant bubbles |
| Inbound image/file message parts | **done** | Path chips; http(s) + workspace `fs.raw` image preview; honest chip on failure |
| Electron Notification (blurred) | **done** | `needs_approval` refresh + stream `done` with text; click focuses window; never auto-approves |

State RPC: `widgets.state.set` (**done** for options), `widgets.state.patch` (**partial**).

## 3. Sentinel approvals (egress.*)

**No dedicated `approvals.subscribe`.** Official client:

1. React-query `egress.approvals` with `staleTime: 5000`.
2. `agent.status` with `activity_code: needs_approval` drives UI attention + refetch.
3. Snapshot field `pending_approvals` / `recent_approvals` on some activity sync payloads.

Decide: `POST /approvals/{id}/decide` with
`{approval_id, decision, always_scope?, allow_always_scope?, notification_channel:"ui", …}`.
Decisions: `allow_once`, `allow_session`, `allow_always`, `deny`, `deny_always`. 
`allow_always` / `deny_always` set `always_scope` / `allow_always_scope` to
`destination_domain` (network) or `entity` (space-reader).

| Method | Status |
|---|---|
| `egress.approvals` `GET /approvals` · sentinel | **done** |
| `egress.approval` `GET /approvals/{approval_id}` · sentinel | **done** |
| `egress.approval.editable_message` `GET /approvals/{approval_id}/editable-message` · sentinel | **partial** |
| `egress.approval.decide` `POST /approvals/{approval_id}/decide` · sentinel | **done** |
| `egress.approval.edit_message` `POST /approvals/{approval_id}/edit-message` · sentinel | **partial** |
| `egress.approval.history` `GET /approvals/history` · sentinel | **partial** |
| `egress.permissions` `GET /permissions` · sentinel | **partial** |
| `permissions.settings` `GET /permissions/settings` · sentinel | **done** |
| `permissions.inventory` `GET /permissions/inventory` · daemon | **partial** |
| `permissions.settings.update` `PATCH /permissions/settings` · sentinel | **partial** |
| `egress.permissions.hitl` `PATCH /permissions/hitl` · sentinel | **partial** |
| `egress.permissions.hitl.snooze.delete` `DELETE /permissions/hitl/snooze` · sentinel | **missing** |
| `egress.permissions.tproxy` `PATCH /permissions/tproxy` · sentinel | **missing** |
| `egress.permissions.mitm` `PATCH /permissions/mitm` · sentinel | **missing** |
| `egress.permissions.sni_rejection` `PATCH /permissions/sni-rejection` · sentinel | **missing** |
| `egress.permissions.active` `GET /permissions/active` · sentinel | **partial** |
| `egress.permissions.active.update` `PATCH /permissions/active` · sentinel | **missing** |
| `egress.permissions.scoped` `GET /permissions/scopes/{scope_type}/{scope_id}` · sentinel | **partial** |
| `egress.permissions.scoped.update` `PATCH /permissions/scopes/{scope_type}/{scope_id}` · sentinel | **missing** |
| `egress.permissions.revoke` `POST /permissions/revoke` · sentinel | **partial** |
| `egress.permissions.reset` `POST /permissions/reset` · sentinel | **partial** |
| `egress.permissions.network_rules` `PATCH /permissions/network-rules` · sentinel | **partial** |
| `egress.permissions.connector` `PATCH /permissions/connectors/{connector}` · sentinel | **partial** |
| `egress.permissions.connector.reset` `DELETE /permissions/connectors/{connector}` · sentinel | **missing** |

BotHub UI: in-chat `ApprovalCard` + info-panel `ApprovalsSection`. Never auto-approve.

## 4. Capability matrix by RPC prefix

Total methods: **387**.

| Prefix | # | done | partial | missing | Highest-value notes |
|---|---:|---:|---:|---:|---|
| `peers` | 26 | 0 | 13 | 13 | Trusted Network UI (Members); Shared Agents Noise class still deferred |
| `spaces` | 24 | 0 | 0 | 24 | Spaces / canvases |
| `egress` | 21 | 3 | 11 | 7 | HITL approvals + network permissions |
| `email` | 19 | 0 | 0 | 19 | Agent mailbox |
| `voice` | 19 | 0 | 0 | 19 | Voice calls / dictation |
| `feed` | 16 | 0 | 0 | 16 | Home feed |
| `chat` | 15 | 6 | 9 | 0 | Core messaging |
| `shared_agents` | 15 | 0 | 0 | 15 | Remote shared agent (alt Noise class) |
| `browser_task` | 14 | 0 | 0 | 14 | Remote browser takeover |
| `fs` | 14 | 4 | 10 | 0 | Library + upload path for large attachments |
| `connectors` | 11 | 6 | 4 | 1 | OAuth connectors list/connect |
| `artifacts` | 11 | 1 | 10 | 0 | Pinned artifacts / slides |
| `credentials` | 10 | 0 | 0 | 10 |  |
| `onboarding` | 9 | 0 | 0 | 9 | Guided onboarding |
| `api` | 9 | 0 | 0 | 9 |  |
| `peerSpaces` | 8 | 0 | 0 | 8 | Shared spaces with peers |
| `browser` | 7 | 0 | 0 | 7 |  |
| `session` | 7 | 6 | 0 | 1 | Thread CRUD |
| `goals` | 6 | 0 | 0 | 6 |  |
| `tasks` | 5 | 2 | 0 | 3 | Schedules |
| `node` | 5 | 0 | 0 | 5 |  |
| `navigation` | 5 | 0 | 0 | 5 |  |
| `memory` | 4 | 0 | 4 | 0 | Agent memory search/get |
| `podcasts` | 4 | 0 | 0 | 4 |  |
| `redteam` | 4 | 0 | 0 | 4 |  |
| `activity` | 3 | 2 | 1 | 0 | Activity feed |
| `skills` | 3 | 0 | 3 | 0 | Skill toggles |
| `client` | 3 | 0 | 3 | 0 | Capability registration / invoke |
| `channels` | 3 | 0 | 0 | 3 |  |
| `custom_connectors` | 3 | 0 | 0 | 3 |  |
| `computer` | 3 | 0 | 3 | 0 | Computer use previews |
| `shopping` | 3 | 0 | 0 | 3 |  |
| `saved` | 3 | 0 | 0 | 3 |  |
| `hotels` | 3 | 0 | 0 | 3 |  |
| `nodes` | 3 | 0 | 0 | 3 |  |
| `permissions` | 3 | 0 | 3 | 0 |  |
| `sharing` | 2 | 0 | 0 | 2 |  |
| `sessions` | 2 | 1 | 0 | 1 | List threads |
| `subagents` | 2 | 0 | 0 | 2 |  |
| `config` | 2 | 1 | 1 | 0 | Agent config |
| `vm` | 2 | 0 | 0 | 2 | VM control |
| `bug_report_logs` | 2 | 0 | 0 | 2 |  |
| `product_improvements` | 2 | 0 | 0 | 2 |  |
| `invite` | 2 | 0 | 0 | 2 |  |
| `messenger` | 2 | 0 | 0 | 2 |  |
| `subscription` | 2 | 0 | 0 | 2 |  |
| `whatsapp` | 2 | 0 | 0 | 2 |  |
| `whatsapp_companion` | 2 | 0 | 0 | 2 |  |
| `search` | 2 | 0 | 0 | 2 |  |
| `identity` | 2 | 0 | 0 | 2 |  |
| `git` | 2 | 0 | 0 | 2 |  |
| `pin` | 2 | 0 | 0 | 2 |  |
| `wallet` | 2 | 0 | 0 | 2 |  |
| `ssh` | 2 | 0 | 0 | 2 |  |
| `model` | 2 | 0 | 0 | 2 |  |
| `widgets` | 2 | 1 | 1 | 0 | Option / rich widget state |
| `professional_consent` | 1 | 0 | 0 | 1 |  |
| `home_link_bug_reports` | 1 | 0 | 0 | 1 |  |
| `dyi` | 1 | 0 | 0 | 1 |  |
| `grants` | 1 | 0 | 0 | 1 |  |
| `vault` | 1 | 0 | 0 | 1 |  |
| `messenger_companion` | 1 | 0 | 0 | 1 |  |
| `messenger-read` | 1 | 0 | 0 | 1 |  |
| `foa` | 1 | 0 | 0 | 1 |  |
| `foa_auth` | 1 | 0 | 0 | 1 |  |
| `bootstrap` | 1 | 0 | 1 | 0 |  |
| `reactions` | 1 | 0 | 0 | 1 |  |
| `oauth` | 1 | 0 | 0 | 1 |  |
| `ac_oauth` | 1 | 0 | 0 | 1 |  |
| `github` | 1 | 0 | 0 | 1 |  |
| `api_key_auth` | 1 | 0 | 0 | 1 |  |
| `consent_auth` | 1 | 0 | 0 | 1 |  |
| `username_password_auth` | 1 | 0 | 0 | 1 |  |
| `browser_stream` | 1 | 0 | 0 | 1 |  |
| `browser_activity` | 1 | 0 | 0 | 1 |  |
| `iframe` | 1 | 0 | 0 | 1 |  |
| `goal_prompt` | 1 | 0 | 0 | 1 |  |
| `ads` | 1 | 0 | 0 | 1 |  |
| `check` | 1 | 0 | 0 | 1 |  |
| `idea-cards` | 1 | 0 | 0 | 1 |  |
| `connection` | 1 | 1 | 0 | 0 |  |
| `theme` | 1 | 0 | 1 | 0 |  |

## 5. Full method table

| Method | HTTP | Path | Service | Sub | Status |
|---|---|---|---|---|---|
| `ac_oauth.callback` | POST | `/ac_oauth/callback` | — |  | **missing** |
| `activity.get` | GET | `/activity/{id}` | — |  | **done** |
| `activity.list` | GET | `/activity` | — |  | **done** |
| `activity.subscribe` | POST | `/activity/subscribe` | — | yes | **partial** |
| `ads.details` | GET | `/api/ads/details` | — |  | **missing** |
| `api.idea-cards.debug` | GET | `/api/idea-cards/{ideaCardId}/debug` | — |  | **missing** |
| `api.idea-cards.detail` | GET | `/api/idea-cards/{ideaCardId}` | — |  | **missing** |
| `api.idea-cards.execute` | POST | `/api/idea-cards/{ideaCardId}/execute` | — |  | **missing** |
| `api.idea-cards.list` | GET | `/api/idea-cards` | — |  | **missing** |
| `api.idea-cards.share` | POST | `/api/idea-cards/{ideaCardId}/share` | — |  | **missing** |
| `api.idea-cards.share-preview` | GET | `/api/idea-cards/{ideaCardId}/share-preview` | — |  | **missing** |
| `api.ideas.engagement` | POST | `/api/ideas/{id}/engagement` | — |  | **missing** |
| `api.ideas.feedback` | POST | `/api/ideas/{id}/feedback` | — |  | **missing** |
| `api.ideas.reset` | POST | `/api/ideas/reset` | — |  | **missing** |
| `api_key_auth.callback` | POST | `/api_key_auth/callback` | authd |  | **missing** |
| `artifacts.fetch_url` | GET | `/artifacts/fetch_url` | — |  | **partial** |
| `artifacts.list` | GET | `/api/artifacts` | — |  | **done** |
| `artifacts.participation.get` | GET | `/api/artifacts/participation` | — |  | **partial** |
| `artifacts.participation.update` | POST | `/api/artifacts/participation` | — |  | **partial** |
| `artifacts.pin` | POST | `/api/artifacts/pin` | — |  | **partial** |
| `artifacts.placement.set` | POST | `/api/artifacts/placement` | — |  | **partial** |
| `artifacts.remove` | POST | `/artifacts/remove` | — |  | **partial** |
| `artifacts.save` | POST | `/api/artifacts/save` | — |  | **partial** |
| `artifacts.share` | POST | `/artifacts/share` | — |  | **partial** |
| `artifacts.slides.rebuild` | POST | `/api/artifacts/slides/rebuild` | — |  | **partial** |
| `artifacts.subscribe` | POST | `/api/artifacts/subscribe` | — | yes | **partial** |
| `bootstrap.reset` | POST | `/bootstrap/reset` | — |  | **partial** |
| `browser.debug_access.get` | GET | `/api/browser/debug-access` | — |  | **missing** |
| `browser.lease` | POST | `/api/browser/lease` | — |  | **missing** |
| `browser.lease_overrides.get` | GET | `/api/browser/lease-overrides` | — |  | **missing** |
| `browser.lease_overrides.release` | POST | `/api/browser/lease-overrides/release` | — |  | **missing** |
| `browser.lease_overrides.set` | PATCH | `/api/browser/lease-overrides` | — |  | **missing** |
| `browser.local_testing.get` | GET | `/api/browser/local-testing` | — |  | **missing** |
| `browser.local_testing.set` | PATCH | `/api/browser/local-testing` | — |  | **missing** |
| `browser_activity.snapshot` | GET | `/api/browser-activity/actions/{action_id}/snapshot` | — |  | **missing** |
| `browser_stream.attach` | POST | `/api/browser-task/{task_id}/websockify?mode=attach` | — |  | **missing** |
| `browser_task.clipboard.copy` | POST | `/api/browser-task/{task_id}/clipboard/copy` | — |  | **missing** |
| `browser_task.clipboard.paste` | POST | `/api/browser-task/{task_id}/clipboard/paste` | — |  | **missing** |
| `browser_task.clipboard.readiness` | POST | `/api/browser-task/{task_id}/clipboard/readiness` | — |  | **missing** |
| `browser_task.close` | POST | `/api/browser-task/{task_id}/close` | — |  | **missing** |
| `browser_task.end_and_release` | POST | `/api/browser-task/{task_id}/end-and-release` | — |  | **missing** |
| `browser_task.get` | GET | `/api/browser-task/{task_id}` | — |  | **missing** |
| `browser_task.heartbeat` | POST | `/api/browser-task/{task_id}/heartbeat` | — |  | **missing** |
| `browser_task.lease_info` | GET | `/api/browser-task/{task_id}/lease` | — |  | **missing** |
| `browser_task.present` | POST | `/api/browser-task/{task_id}/present` | — |  | **missing** |
| `browser_task.refresh_environment` | POST | `/api/browser-task/{task_id}/refresh-environment` | — |  | **missing** |
| `browser_task.release` | POST | `/api/browser-task/{task_id}/release` | — |  | **missing** |
| `browser_task.stop` | POST | `/api/browser-task/{task_id}/stop` | — |  | **missing** |
| `browser_task.takeover` | POST | `/api/browser-task/{task_id}/takeover` | — |  | **missing** |
| `browser_task.viewer` | PATCH | `/api/browser-task/{task_id}/viewer` | daemon |  | **missing** |
| `bug_report_logs.create` | POST | `/api/debug/bug-report-logs` | — |  | **missing** |
| `bug_report_logs.download` | GET | `/api/debug/bug-report-logs/{file_id}` | — |  | **missing** |
| `channels.link` | POST | `/channels/link` | — |  | **missing** |
| `channels.status` | GET | `/channels/status` | — |  | **missing** |
| `channels.unlink` | POST | `/channels/unlink` | — |  | **missing** |
| `chat.cancel` | POST | `/chat/cancel` | — |  | **done** |
| `chat.delete_turn` | POST | `/api/chat/delete-turn` | — |  | **partial** |
| `chat.history` | GET | `/chat/history` | — |  | **done** |
| `chat.history_window` | GET | `/chat/history-window` | — |  | **done** |
| `chat.mark_seen` | POST | `/api/chat/{thread_id}/seen` | — |  | **done** |
| `chat.message_get` | GET | `/chat/message` | — |  | **partial** |
| `chat.poke` | POST | `/chat/poke` | — |  | **partial** |
| `chat.search` | GET | `/chat/search` | — |  | **partial** |
| `chat.stream` | POST | `/chat/stream` | — | yes | **done** |
| `chat.stream_events` | POST | `/chat/stream-events` | — | yes | **partial** |
| `chat.subscribe` | POST | `/chat/subscribe` | — | yes | **done** |
| `chat.sxs.select` | POST | `/api/chat/sxs/select` | — |  | **partial** |
| `chat.themes` | GET | `/api/chat/themes` | — |  | **partial** |
| `chat.themes.set` | POST | `/api/chat/themes/set` | — |  | **partial** |
| `chat.unread_count` | GET | `/chat/unread-count` | — |  | **partial** |
| `check` | GET | `/check` | — |  | **missing** |
| `client.invoke.result` | POST | `/client/invoke-result` | — |  | **partial** |
| `client.register_capabilities` | POST | `/client/register-capabilities` | — |  | **partial** |
| `client.runtime_state` | POST | `/api/client/runtime-state` | — |  | **partial** |
| `computer.context` | GET | `/api/computer/context` | — |  | **partial** |
| `computer.preview` | GET | `/api/computer/previews/{task_id}/{sha256}` | — |  | **partial** |
| `computer.subscribe` | POST | `/api/computer/subscribe` | — | yes | **partial** |
| `config.get` | GET | `/config` | — |  | **done** |
| `config.update` | PATCH | `/config` | — |  | **partial** |
| `connection.ping` | POST | `/api/ping` | — |  | **done** |
| `connectors.accounts` | GET | `/connectors/{id}/accounts` | — |  | **partial** |
| `connectors.accounts_link` | POST | `/connectors/{id}/accounts/link` | — |  | **partial** |
| `connectors.accounts_unlink` | POST | `/connectors/{id}/accounts/{account_id}/unlink` | — |  | **partial** |
| `connectors.connect` | POST | `/connectors/{id}/connect` | — |  | **done** |
| `connectors.connect_info` | GET | `/connectors/{id}/connect/info` | — |  | **done** |
| `connectors.disconnect` | POST | `/connectors/{id}/disconnect` | — |  | **done** |
| `connectors.get` | GET | `/connectors/{id}` | — |  | **done** |
| `connectors.homepage` | GET | `/connectors/homepage` | — |  | **done** |
| `connectors.list` | GET | `/connectors` | — |  | **done** |
| `connectors.permissions` | GET | `/connectors/{id}/permissions` | — |  | **partial** |
| `connectors.scope_link` | POST | `/connectors/{id}/scopes/{method}/link` | — |  | **missing** |
| `consent_auth.callback` | POST | `/consent_auth/callback` | — |  | **missing** |
| `credentials.capture` | POST | `/v1/credentials/capture` | authd |  | **missing** |
| `credentials.capture.external_provider.fulfill` | POST | `/v1/credentials/capture/external-provider/fulfill` | authd |  | **missing** |
| `credentials.capture.external_provider.request` | POST | `/v1/credentials/capture/external-provider/request` | authd |  | **missing** |
| `credentials.catalog` | GET | `/v1/credentials/catalog` | authd |  | **missing** |
| `credentials.catalog.delete` | POST | `/v1/credentials/catalog/delete` | authd |  | **missing** |
| `credentials.catalog.details` | GET | `/v1/credentials/catalog/details` | authd |  | **missing** |
| `credentials.catalog.update` | POST | `/v1/credentials/catalog/update` | authd |  | **missing** |
| `credentials.delete` | POST | `/v1/credentials/delete` | authd |  | **missing** |
| `credentials.list` | GET | `/v1/credentials/list` | authd |  | **missing** |
| `credentials.register` | POST | `/v1/credentials/register` | authd |  | **missing** |
| `custom_connectors.delete` | POST | `/v1/custom-connectors/delete` | authd |  | **missing** |
| `custom_connectors.list` | POST | `/v1/custom-connectors/list` | authd |  | **missing** |
| `custom_connectors.register` | POST | `/v1/custom-connectors/register` | authd |  | **missing** |
| `dyi.export` | POST | `/api/dyi/export` | daemon |  | **missing** |
| `egress.approval` | GET | `/approvals/{approval_id}` | sentinel |  | **done** |
| `egress.approval.decide` | POST | `/approvals/{approval_id}/decide` | sentinel |  | **done** |
| `egress.approval.edit_message` | POST | `/approvals/{approval_id}/edit-message` | sentinel |  | **partial** |
| `egress.approval.editable_message` | GET | `/approvals/{approval_id}/editable-message` | sentinel |  | **partial** |
| `egress.approval.history` | GET | `/approvals/history` | sentinel |  | **partial** |
| `egress.approvals` | GET | `/approvals` | sentinel |  | **done** |
| `egress.permissions` | GET | `/permissions` | sentinel |  | **partial** |
| `egress.permissions.active` | GET | `/permissions/active` | sentinel |  | **partial** |
| `egress.permissions.active.update` | PATCH | `/permissions/active` | sentinel |  | **missing** |
| `egress.permissions.connector` | PATCH | `/permissions/connectors/{connector}` | sentinel |  | **partial** |
| `egress.permissions.connector.reset` | DELETE | `/permissions/connectors/{connector}` | sentinel |  | **missing** |
| `egress.permissions.hitl` | PATCH | `/permissions/hitl` | sentinel |  | **partial** |
| `egress.permissions.hitl.snooze.delete` | DELETE | `/permissions/hitl/snooze` | sentinel |  | **missing** |
| `egress.permissions.mitm` | PATCH | `/permissions/mitm` | sentinel |  | **missing** |
| `egress.permissions.network_rules` | PATCH | `/permissions/network-rules` | sentinel |  | **partial** |
| `egress.permissions.reset` | POST | `/permissions/reset` | sentinel |  | **partial** |
| `egress.permissions.revoke` | POST | `/permissions/revoke` | sentinel |  | **partial** |
| `egress.permissions.scoped` | GET | `/permissions/scopes/{scope_type}/{scope_id}` | sentinel |  | **partial** |
| `egress.permissions.scoped.update` | PATCH | `/permissions/scopes/{scope_type}/{scope_id}` | sentinel |  | **missing** |
| `egress.permissions.sni_rejection` | PATCH | `/permissions/sni-rejection` | sentinel |  | **missing** |
| `egress.permissions.tproxy` | PATCH | `/permissions/tproxy` | sentinel |  | **missing** |
| `email.attachment.get` | GET | `/api/email/messages/{message_id}/attachments/{index}` | daemon |  | **missing** |
| `email.mailbox.address_availability` | GET | `/api/email/mailbox/address-availability` | daemon |  | **missing** |
| `email.mailbox.create` | POST | `/api/email/mailbox` | daemon |  | **missing** |
| `email.mailbox.delete` | DELETE | `/api/email/mailbox` | daemon |  | **missing** |
| `email.mailbox.get` | GET | `/api/email/mailbox` | daemon |  | **missing** |
| `email.mailbox.setup` | GET | `/api/email/mailbox/setup` | daemon |  | **missing** |
| `email.mailbox.setup.end` | POST | `/api/email/mailbox/setup/end` | daemon |  | **missing** |
| `email.mailbox.update` | PATCH | `/api/email/mailbox` | daemon |  | **missing** |
| `email.messages.delete` | DELETE | `/api/email/messages/{message_id}` | daemon |  | **missing** |
| `email.messages.get` | GET | `/api/email/messages/{message_id}` | daemon |  | **missing** |
| `email.owner_candidates.list` | GET | `/api/email/owner-candidates` | daemon |  | **missing** |
| `email.owner_challenges.create` | POST | `/api/email/owners/challenges` | daemon |  | **missing** |
| `email.owner_challenges.verify` | POST | `/api/email/owners/challenges/{challenge_id}/verify` | daemon |  | **missing** |
| `email.owners.list` | GET | `/api/email/owners` | daemon |  | **missing** |
| `email.owners.revoke` | DELETE | `/api/email/owners/{owner_id}` | daemon |  | **missing** |
| `email.settings.get` | GET | `/api/email/settings` | daemon |  | **missing** |
| `email.settings.update` | PATCH | `/api/email/settings` | daemon |  | **missing** |
| `email.threads.get` | GET | `/api/email/threads/{thread_id}` | daemon |  | **missing** |
| `email.threads.list` | GET | `/api/email/threads` | daemon |  | **missing** |
| `feed.infinite` | GET | `/api/feed/infinite` | — |  | **missing** |
| `feed.list` | GET | `/api/feed` | — |  | **missing** |
| `feed.prompt.get` | GET | `/api/feed/prompt` | — |  | **missing** |
| `feed.prompt.update` | PATCH | `/api/feed/prompt` | — |  | **missing** |
| `feed.prompts.delete` | DELETE | `/api/feed/prompts/{prompt_id}` | — |  | **missing** |
| `feed.regenerate` | POST | `/api/feed/regenerate` | — |  | **missing** |
| `feed.reorder` | POST | `/api/feed/reorder` | — |  | **missing** |
| `feed.search` | GET | `/api/feed/search` | — |  | **missing** |
| `feed.social_source_icon` | GET | `/api/feed/social-source-icon/{source}` | — |  | **missing** |
| `feed.status` | GET | `/api/feed/status` | — |  | **missing** |
| `feed.unit` | GET | `/api/feed/units/{unit_id}` | — |  | **missing** |
| `feed.unit.delete` | DELETE | `/api/feed/units/{unit_id}` | — |  | **missing** |
| `feed.unit.media` | GET | `/api/feed/units/{unit_id}/media/{handle}` | — |  | **missing** |
| `feed.unit.reaction` | POST | `/api/feed/units/{unit_id}/reaction` | — |  | **missing** |
| `feed.unit.tap` | POST | `/api/feed/units/{unit_id}/tap` | — |  | **missing** |
| `feed.units.seen` | POST | `/api/feed/units/seen` | — |  | **missing** |
| `foa.accounts` | GET | `/api/foa/accounts` | — |  | **missing** |
| `foa_auth.callback` | POST | `/api/foa_auth/callback` | authd |  | **missing** |
| `fs.delete` | POST | `/fs/delete` | — |  | **partial** |
| `fs.export` | POST | `/fs/export` | — |  | **partial** |
| `fs.library` | POST | `/fs/library` | — |  | **done** |
| `fs.list` | POST | `/fs/list` | — |  | **done** |
| `fs.mkdir` | POST | `/fs/mkdir` | — |  | **partial** |
| `fs.raw` | GET | `/fs/raw/{*path}` | — |  | **done** |
| `fs.read` | POST | `/fs/read` | — |  | **done** |
| `fs.reads` | POST | `/fs/reads` | — |  | **partial** |
| `fs.rename` | POST | `/fs/rename` | — |  | **partial** |
| `fs.search` | POST | `/fs/search` | — |  | **partial** |
| `fs.stat` | POST | `/fs/stat` | — |  | **done** |
| `fs.stats` | POST | `/fs/stats` | — |  | **partial** |
| `fs.subscribe` | POST | `/api/fs/subscribe` | — | yes | **partial** |
| `fs.write` | POST | `/fs/write` | — |  | **partial** |
| `git.log` | POST | `/git/log` | — |  | **missing** |
| `git.show_file` | POST | `/git/show_file` | — |  | **missing** |
| `github.installation.callback` | POST | `/api/github/installation/callback` | — |  | **missing** |
| `goal_prompt` | POST | `/goal_prompt` | — |  | **missing** |
| `goals.delete` | DELETE | `/goals/{id}` | — |  | **missing** |
| `goals.get` | GET | `/goals/{id}` | — |  | **missing** |
| `goals.list` | GET | `/goals` | — |  | **missing** |
| `goals.reorder` | PATCH | `/goals/{id}/order` | — |  | **missing** |
| `goals.suggestions.decide` | POST | `/goals/{goal_id}/suggestions/{suggestion_id}/decision` | — |  | **missing** |
| `goals.update` | PATCH | `/goals/{id}` | — |  | **missing** |
| `grants.list` | GET | `/grants` | daemon |  | **missing** |
| `home_link_bug_reports.collect` | POST | `/api/debug/home-link-bug-reports` | — |  | **missing** |
| `hotels.details` | GET | `/api/hotels/details` | daemon |  | **missing** |
| `hotels.events` | POST | `/api/hotels/events` | daemon |  | **missing** |
| `hotels.results` | GET | `/api/hotels/results` | daemon |  | **missing** |
| `idea-cards.media` | GET | `/api/idea-cards/media/{handle}` | — |  | **missing** |
| `identity` | GET | `/identity` | — |  | **missing** |
| `identity.subscribe` | POST | `/identity/subscribe` | — | yes | **missing** |
| `iframe.call` | POST | `/call` | — |  | **missing** |
| `invite.badge.get` | GET | `/api/invite/badge` | daemon |  | **missing** |
| `invite.badge.seen` | POST | `/api/invite/badge/seen` | daemon |  | **missing** |
| `memory.consolidate` | POST | `/memory/consolidate` | — |  | **partial** |
| `memory.get` | POST | `/memory/get` | — |  | **partial** |
| `memory.reindex` | POST | `/memory/reindex` | — |  | **partial** |
| `memory.search` | POST | `/memory/search` | — |  | **partial** |
| `messenger-read.unlock` | POST | `/api/messenger-read/unlock` | — |  | **missing** |
| `messenger.fb-check` | GET | `/api/messenger/fb-check` | — |  | **missing** |
| `messenger.pin_status` | GET | `/api/messenger_companion/pin-status` | — |  | **missing** |
| `messenger_companion.unlock` | POST | `/api/messenger_companion/unlock` | — |  | **missing** |
| `model.get` | GET | `/model` | — |  | **missing** |
| `model.set` | POST | `/model` | — |  | **missing** |
| `navigation.pinned.set` | POST | `/navigation/pinned/set` | — |  | **missing** |
| `navigation.recents.touch` | POST | `/navigation/recents/touch` | — |  | **missing** |
| `navigation.subscribe` | POST | `/navigation/subscribe` | — | yes | **missing** |
| `navigation.tab_order.get` | GET | `/api/navigation/tab-order` | — |  | **missing** |
| `navigation.tab_order.set` | PUT | `/api/navigation/tab-order` | — |  | **missing** |
| `node.disconnect` | POST | `/api/nodes/disconnect` | — |  | **missing** |
| `node.heartbeat` | POST | `/api/nodes/heartbeat` | — |  | **missing** |
| `node.list` | POST | `/api/nodes/list` | — |  | **missing** |
| `node.register` | POST | `/api/nodes/register` | — |  | **missing** |
| `node.unpair` | POST | `/api/nodes/unpair` | — |  | **missing** |
| `nodes.invoke_ack` | POST | `/nodes/invoke-ack` | — |  | **missing** |
| `nodes.invoke_result` | POST | `/nodes/invoke-result` | — |  | **missing** |
| `nodes.sync` | POST | `/nodes/sync` | — |  | **missing** |
| `oauth.callback` | POST | `/oauth/callback` | authd |  | **missing** |
| `onboarding.complete` | POST | `/onboarding/complete` | — |  | **missing** |
| `onboarding.identity` | GET | `/onboarding/identity` | — |  | **missing** |
| `onboarding.identity.set` | POST | `/onboarding/identity` | — |  | **missing** |
| `onboarding.pages.start` | POST | `/onboarding/pages` | — |  | **missing** |
| `onboarding.questions` | GET | `/onboarding/questions` | — |  | **missing** |
| `onboarding.reset` | POST | `/onboarding/reset` | — |  | **missing** |
| `onboarding.state` | GET | `/onboarding` | — |  | **missing** |
| `onboarding.tasks` | GET | `/onboarding/tasks` | — |  | **missing** |
| `onboarding.variants` | GET | `/api/onboarding/variants` | — |  | **missing** |
| `peerSpaces.asset` | GET | `/peer-spaces/{host_muse}/{slug}/{*subpath}` | daemon |  | **missing** |
| `peerSpaces.document` | GET | `/peer-spaces/{host_muse}/{slug}/` | daemon |  | **missing** |
| `peerSpaces.get` | GET | `/peer-spaces/by-id/{host_muse}/{space_id}/{*subpath}` | daemon |  | **missing** |
| `peerSpaces.post` | POST | `/peer-spaces/by-id/{host_muse}/{space_id}/{*subpath}` | daemon |  | **missing** |
| `peerSpaces.share` | POST | `/peer-spaces/share` | daemon |  | **missing** |
| `peerSpaces.sharedWithMe.list` | GET | `/peer-spaces/shared-with-me` | daemon |  | **missing** |
| `peerSpaces.shares.list` | GET | `/peer-spaces/shares/{slug}` | daemon |  | **missing** |
| `peerSpaces.unshare` | POST | `/peer-spaces/unshare` | daemon |  | **missing** |
| `peers.activity.dismiss` | POST | `/peers/activity/{activity_id}/dismiss` | daemon |  | **missing** |
| `peers.activity.list` | GET | `/peers/activity` | daemon |  | **missing** |
| `peers.avatar` | GET | `/peers/{muse_id}/avatar/{sha256}` | daemon |  | **missing** |
| `peers.connections.get` | GET | `/peers/connections/{connection_id}` | daemon |  | **missing** |
| `peers.disconnect` | DELETE | `/peers/{muse_id}?relationship_generation_id={relationship_generation_id}&relationship_revision={relationship_revision}&relationship_started_at_ms={relationship_started_at_ms}&request_expires_at_ms={request_expires_at_ms}` | daemon |  | **partial** |
| `peers.discretion.write` | POST | `/fs/write` | — |  | **missing** |
| `peers.inbox.decline` | POST | `/peers/inbox/decline` | daemon |  | **partial** |
| `peers.inbox.deliver` | POST | `/peers/inbox/deliver` | daemon |  | **missing** |
| `peers.inbox.list` | GET | `/peers/inbox` | daemon |  | **partial** |
| `peers.invites.accept` | POST | `/peers/invites/accept` | daemon |  | **partial** |
| `peers.invites.create` | POST | `/peers/invites` | daemon |  | **partial** |
| `peers.invites.delivery` | POST | `/peers/invites/{invite_id}/delivery` | daemon |  | **missing** |
| `peers.invites.list` | GET | `/peers/invites` | daemon |  | **partial** |
| `peers.invites.open` | POST | `/peers/invites/open` | daemon |  | **partial** |
| `peers.invites.revoke` | DELETE | `/peers/invites/{invite_id}` | daemon |  | **partial** |
| `peers.list` | GET | `/peers` | daemon |  | **partial** |
| `peers.photo` | GET | `/peers/{muse_id}/photo/{sha256}` | daemon |  | **missing** |
| `peers.requests.list` | GET | `/peers/requests` | daemon |  | **partial** |
| `peers.requests.sas` | GET | `/peers/requests/{relationship_generation_id}/sas` | daemon |  | **partial** |
| `peers.requests.sas.confirm` | POST | `/peers/requests/{relationship_generation_id}/sas/confirm` | daemon |  | **partial** |
| `peers.reset_conversation` | POST | `/peers/{muse_id}/reset_conversation` | daemon |  | **missing** |
| `peers.rules.delete` | DELETE | `/peers/{muse_id}/rules/{rule_id}` | daemon |  | **missing** |
| `peers.rules.list` | GET | `/peers/{muse_id}/rules` | daemon |  | **missing** |
| `peers.rules.set` | POST | `/peers/{muse_id}/rules` | daemon |  | **missing** |
| `peers.status` | GET | `/peers/status` | daemon |  | **partial** |
| `peers.update` | PATCH | `/peers/{muse_id}` | daemon |  | **missing** |
| `permissions.inventory` | GET | `/permissions/inventory` | daemon |  | **partial** |
| `permissions.settings` | GET | `/permissions/settings` | sentinel |  | **partial** |
| `permissions.settings.update` | PATCH | `/permissions/settings` | sentinel |  | **partial** |
| `pin.reminder_confirm` | POST | `/api/pin-reminder/confirm` | — |  | **missing** |
| `pin.update` | POST | `/api/pin-reminder/update` | — |  | **missing** |
| `podcasts.episode.delete` | DELETE | `/api/podcasts/episodes/{slug}` | — |  | **missing** |
| `podcasts.episodes.list` | GET | `/api/podcasts/episodes` | — |  | **missing** |
| `podcasts.feed.get` | GET | `/api/podcasts/feed` | — |  | **missing** |
| `podcasts.feeds.list` | GET | `/api/podcasts/feeds` | — |  | **missing** |
| `product_improvements.get` | GET | `/api/product-improvements` | daemon |  | **missing** |
| `product_improvements.set` | POST | `/api/product-improvements` | daemon |  | **missing** |
| `professional_consent.resume` | POST | `/api/professional-consent/resume` | — |  | **missing** |
| `reactions.toggle` | POST | `/reactions/toggle` | — |  | **missing** |
| `redteam.mocks.apply` | POST | `/redteam/mocks` | — |  | **missing** |
| `redteam.mocks.clear` | DELETE | `/redteam/mocks` | — |  | **missing** |
| `redteam.mocks.get` | GET | `/redteam/mocks` | — |  | **missing** |
| `redteam.sidecar.tail` | GET | `/redteam/mocks/sidecar` | — |  | **missing** |
| `saved.default_save` | POST | `/api/saved/default` | — |  | **missing** |
| `saved.default_status` | GET | `/api/saved/default` | — |  | **missing** |
| `saved.item_delete` | DELETE | `/api/saved/items/{item_id}` | — |  | **missing** |
| `search.debug_overrides.get` | GET | `/api/search/debug-overrides` | — |  | **missing** |
| `search.debug_overrides.set` | PATCH | `/api/search/debug-overrides` | — |  | **missing** |
| `session.archive` | POST | `/session/archive` | — |  | **done** |
| `session.delete` | POST | `/session/delete` | — |  | **done** |
| `session.pin` | POST | `/session/pin` | — |  | **done** |
| `session.rename` | POST | `/session/rename` | — |  | **done** |
| `session.start` | POST | `/session/start` | — |  | **done** |
| `session.unarchive` | POST | `/session/unarchive` | — |  | **missing** |
| `session.unpin` | POST | `/session/unpin` | — |  | **done** |
| `sessions.get` | GET | `/api/session/list/{id}` | — |  | **missing** |
| `sessions.list` | GET | `/api/session/list` | — |  | **done** |
| `shared_agents.capabilities` | GET | `/shared-agents/capabilities` | — |  | **missing** |
| `shared_agents.create` | POST | `/shared-agents/create-idempotent` | — |  | **missing** |
| `shared_agents.definition` | GET | `/shared-agents/{shared_agent_id}/definition` | — |  | **missing** |
| `shared_agents.definition.update` | PATCH | `/shared-agents/{shared_agent_id}/definition` | — |  | **missing** |
| `shared_agents.delete` | DELETE | `/shared-agents/{shared_agent_id}` | — |  | **missing** |
| `shared_agents.detail` | GET | `/shared-agents/{shared_agent_id}` | — |  | **missing** |
| `shared_agents.identity.update` | PATCH | `/shared-agents/{shared_agent_id}/identity` | — |  | **missing** |
| `shared_agents.list` | GET | `/shared-agents` | — |  | **missing** |
| `shared_agents.remote.open` | POST | `/api/shared-agents/remote/open` | — | yes | **missing** |
| `shared_agents.remote.send` | POST | `/api/shared-agents/remote/send` | — |  | **missing** |
| `shared_agents.shares.conversation` | GET | `/shared-agents/{shared_agent_id}/shares/{share_id}/conversation` | — |  | **missing** |
| `shared_agents.shares.create` | POST | `/shared-agents/{shared_agent_id}/shares` | — |  | **missing** |
| `shared_agents.shares.list` | GET | `/shared-agents/{shared_agent_id}/shares` | — |  | **missing** |
| `shared_agents.shares.revoke` | POST | `/shared-agents/{shared_agent_id}/shares/{share_id}/revoke` | — |  | **missing** |
| `shared_agents.state.update` | PATCH | `/shared-agents/{shared_agent_id}/state` | — |  | **missing** |
| `sharing.attempt` | POST | `/api/sharing/attempt` | daemon |  | **missing** |
| `sharing.eligibility` | GET | `/api/sharing/eligibility` | daemon |  | **missing** |
| `shopping.cart` | GET | `/api/shopping/cart` | — |  | **missing** |
| `shopping.events` | POST | `/api/shopping/events` | — |  | **missing** |
| `shopping.product_details` | GET | `/api/shopping` | — |  | **missing** |
| `skills.disconnect` | POST | `/skills/disconnect` | — |  | **partial** |
| `skills.list` | GET | `/skills` | — |  | **partial** |
| `skills.set_disabled` | POST | `/skills/set-disabled` | — |  | **partial** |
| `spaces.audience.get` | GET | `/spaces/share/{slug}/audience` | — |  | **missing** |
| `spaces.audience.set` | POST | `/spaces/share/{slug}/audience/update` | — |  | **missing** |
| `spaces.cvm.get` | GET | `/spaces/cvm/{slug}/{*subpath}` | — |  | **missing** |
| `spaces.cvm.post` | POST | `/spaces/cvm/{slug}/{*subpath}` | — |  | **missing** |
| `spaces.cvm.render` | GET | `/spaces/cvm/{slug}/` | — |  | **missing** |
| `spaces.debug.invocation` | GET | `/spaces/{slug}/debug/invocations/{invocation_id}` | — |  | **missing** |
| `spaces.debug.invocations` | GET | `/spaces/{slug}/debug/invocations` | — |  | **missing** |
| `spaces.debug.log` | GET | `/spaces/{slug}/debug/log` | — |  | **missing** |
| `spaces.debug.summary` | GET | `/spaces/{slug}/debug/summary` | — |  | **missing** |
| `spaces.delete` | DELETE | `/spaces/v2/{slug}` | — |  | **missing** |
| `spaces.export_html` | GET | `/spaces/{slug}/export.html` | — |  | **missing** |
| `spaces.list` | GET | `/spaces/v2` | — |  | **missing** |
| `spaces.owned.delete` | DELETE | `/spaces/v2/{slug}?source=space` | — |  | **missing** |
| `spaces.save` | POST | `/spaces/v2/{slug}/save` | — |  | **missing** |
| `spaces.saved.delete` | DELETE | `/spaces/v2/{slug}?source=saved_space` | — |  | **missing** |
| `spaces.share` | POST | `/spaces/share/{slug}` | — |  | **missing** |
| `spaces.share.fix` | POST | `/spaces/share/{slug}/fix` | — |  | **missing** |
| `spaces.share.review` | GET | `/spaces/share/{slug}/review` | — |  | **missing** |
| `spaces.share.settings` | GET | `/spaces/share/{slug}/settings` | — |  | **missing** |
| `spaces.share.settings.save` | POST | `/spaces/share/{slug}/settings` | — |  | **missing** |
| `spaces.share.status` | GET | `/spaces/share/{slug}` | — |  | **missing** |
| `spaces.sharing.settings` | GET | `/spaces/share/{slug}/settings` | — |  | **missing** |
| `spaces.subscribe` | POST | `/spaces/subscribe` | — | yes | **missing** |
| `spaces.unshare` | DELETE | `/spaces/share/{slug}` | — |  | **missing** |
| `ssh.operator.disable` | POST | `/v1/ssh/operator/disable` | ssh_access |  | **missing** |
| `ssh.operator.enable` | POST | `/v1/ssh/operator/enable` | ssh_access |  | **missing** |
| `subagents.list` | GET | `/subagents` | — |  | **missing** |
| `subagents.status` | GET | `/subagents/status` | — |  | **missing** |
| `subscription.callback` | POST | `/subscription/callback` | — |  | **missing** |
| `subscription.redeem_complimentary` | POST | `/subscription/redeem-complimentary` | — |  | **missing** |
| `tasks.delete` | DELETE | `/api/tasks/{job_id}` | — |  | **missing** |
| `tasks.list` | GET | `/tasks` | — |  | **done** |
| `tasks.run` | POST | `/tasks/{job_id}/run` | — |  | **missing** |
| `tasks.runs` | GET | `/tasks/runs` | — |  | **missing** |
| `tasks.subscribe` | POST | `/tasks/subscribe` | — | yes | **done** |
| `theme.subscribe` | POST | `/themes/subscribe` | — | yes | **partial** |
| `username_password_auth.callback` | POST | `/username_password_auth/callback` | authd |  | **missing** |
| `vault.luks_status` | GET | `/luks/status` | vault |  | **missing** |
| `vm.enrollment_health` | GET | `/health/enrollment` | — |  | **missing** |
| `vm.health` | GET | `/health` | — |  | **missing** |
| `voice.active_voice` | GET | `/api/voice/active-voice` | — |  | **missing** |
| `voice.active_voice.save` | POST | `/api/voice/active-voice` | — |  | **missing** |
| `voice.available_voices` | GET | `/api/voice/available-voices` | — |  | **missing** |
| `voice.avatar_video.prepare` | POST | `/api/voice/avatar-video/prepare` | — |  | **missing** |
| `voice.calls.join` | POST | `/voice/calls/join` | — |  | **missing** |
| `voice.calls.media_endpoint` | GET | `/api/voice/calls/media-endpoint` | — |  | **missing** |
| `voice.calls.user_speech` | POST | `/api/voice/calls/user-speech` | — |  | **missing** |
| `voice.catalog` | GET | `/api/voice/catalog` | — |  | **missing** |
| `voice.catalog_filters` | GET | `/api/voice/catalog/filters` | — |  | **missing** |
| `voice.custom_voices.delete` | DELETE | `/api/voice/custom-voices/{saved_voice_id}` | — |  | **missing** |
| `voice.custom_voices.list` | GET | `/api/voice/custom-voices` | — |  | **missing** |
| `voice.custom_voices.rename` | PATCH | `/api/voice/custom-voices/{saved_voice_id}` | — |  | **missing** |
| `voice.dictation` | POST | `/api/voice/dictation?sample_rate_hz={sample_rate_hz}` | — |  | **missing** |
| `voice.end_call` | POST | `/api/voice/end-call` | — |  | **missing** |
| `voice.onboarding.reset` | POST | `/api/voice/onboarding/reset` | — |  | **missing** |
| `voice.pipeline_profiles` | GET | `/api/voice/pipeline-profiles` | — |  | **missing** |
| `voice.select_pipeline_profile` | POST | `/api/voice/pipeline-profile` | — |  | **missing** |
| `voice.start_call` | POST | `/api/voice/start-call` | — |  | **missing** |
| `voice.user_speech_started` | POST | `/api/voice/user-speech-started` | — |  | **missing** |
| `wallet.get` | GET | `/wallet` | — |  | **missing** |
| `wallet.set` | POST | `/wallet` | — |  | **missing** |
| `whatsapp.install` | POST | `/whatsapp/install` | — |  | **missing** |
| `whatsapp.login` | POST | `/whatsapp/login` | — |  | **missing** |
| `whatsapp_companion.link` | POST | `/whatsapp_companion/link` | — |  | **missing** |
| `whatsapp_companion.status` | GET | `/whatsapp_companion/status` | — |  | **missing** |
| `widgets.state.patch` | POST | `/widgets/state/patch` | — |  | **partial** |
| `widgets.state.set` | POST | `/widgets/state` | — |  | **done** |

## 6. Attachments / upload (wire)

From official `HatchAttachments` (JS):

1. **Images** → always inline `{type:"image", mime_type, data_base64, filename}` in `chat.stream` items.
2. **Non-image ≥ 10 MiB** (video threshold differs) → eager upload to
   `workspace/user/files/<sanitized>_<counter>_<rand><ext>` then `{type:"file_ref", mime_type, path, filename}`.
3. **Smaller non-image** → `{type:"file", mime_type, data_base64, filename}`.
4. Video `file_ref` ingest was **withdrawn** in current web client.

**Upload transport (official HatchGatewayFs, 2026):** chunked `fs.write` with `data_base64` (512 KiB),
`overwrite`/`append`/`create_parent`; when `stageBeforePublish && chunks>1`, write to
`.upload-<uuid>.part` then `fs.rename` to dest. BotHub: `src/main/muse-native/fs.ts`
(`uploadWorkspaceFile` / `fetchFsRawPreview`). Preview: `fs.raw` GET binary + optional `Range`.

## 7. Notifications / settings

| Surface | RPC / source | Status |
|---|---|---|
| Approval attention | `agent.status` needs_approval + `egress.approvals` | **done** (in-chat card) |
| Desktop OS notifications | client-local | **done** — Electron Notification when blurred (approval / new reply) |
| Permissions settings pane | `permissions.settings*` / `egress.permissions*` | **partial** — InfoPanel + Save → `permissions.settings.update` (network_default / connector_default = auto_allow\|always_ask); protocols[] modes still RO; honest empty |
| Config pane | `config.get` / `config.update` | **partial** (get only) |
| Themes | `chat.themes*` / `theme.subscribe` | **missing** |
| Memory pane | `memory.*` | **partial** — Muse MemorySection (`memory.search`/`get`/`consolidate`); local BotHub notes kept separate |
| Skills pane | `skills.*` | **partial** — SkillsSection list + set_disabled; honest empty when RPC bare |
| Trusted Network | `peers.*` | **partial** — Members tab `PeersSection`: status/list/invites/inbox/requests + create/revoke/open/accept/decline/SAS/disconnect; honest empty if RPC class missing; **never auto-accept**; Shared Agents remote Noise class deferred |
| Per-account proxy | BotHub-local | **done** — Overview `ProxySection`; `safeStorage` (`muse-account-proxy.json`); Electron `session.setProxy` on account partition + Node `ws` agent (`https-proxy-agent` / `socks-proxy-agent`); not a Muse RPC |

## 8. BotHub implementation map

| Module | Role |
|---|---|
| `src/main/muse-native/noise.ts` + `transport.ts` + `gateway.ts` | Noise + RPC + subscriptions |
| `src/main/muse-native/chat.ts` | chat.stream / chat.subscribe state machine |
| `src/main/muse-native/methods.ts` | 387-method registry |
| `src/main/muse-native/{files,sessions,schedules,quota,invite,fs}.ts` | Domain helpers (+ fs.raw preview / chunked upload) |
| `src/main/muse/museSessionManager.ts` | Account lifecycle, watch, bridge to adapter |
| `src/adapters/meta-muse/adapter.ts` | Renderer-facing adapter |
| `src/renderer/.../ApprovalCard.tsx` | In-chat HITL |

## 9. Highest-value remaining gaps

1. ~~Approval refresh on `needs_approval`~~ **done**.
2. ~~Outbound attachments `data_base64` + `file_ref` via `fs.write`~~ **done** (image ≤12MiB inline; non-image ≥10MiB → file_ref).
3. ~~Rich inbound: tool chips + media + shopping/maps/html/slides~~ **done** (RO widgets; no fake commerce).
4. ~~Workspace image preview via `fs.raw`~~ **done** (≤8MiB; honest chip on failure).
5. ~~`permissions.settings` read + Save PATCH defaults~~ **partial** — defaults write UI present; full `protocols[]` mode editor + live confirmation against real VM still needed.
6. ~~Muse `memory.*` + `skills.*` panels~~ (**partial**).
7. ~~Desktop Notification when blurred~~ **done**.
8. ~~Trusted Network `peers.*` Members UI~~ **partial** — core invite/list/accept/SAS/disconnect; never auto-accept; Shared Agents / peerSpaces / peers.rules* still missing.
9. ~~Per-account client proxy~~ **done** (BotHub-local partition + WSS agent; reconnect advised after save).
10. Live redacted capture of `permissions.settings.update` body + shopping widget payload samples (UI parses known shapes from muse.ai JS; wire samples still thin).
11. Shared Agents (`shared_agents.*`) needs alternate Noise connectionClass — deferred (no fake host API).
12. Spaces / feed / voice / email / browser_task — large remaining surfaces.


## 10. Slice 70 (near-native media / widgets / permissions write / file_ref)

| Item | Status | Notes |
|---|---|---|
| Inbound workspace image via `fs.raw` | **done** | `fetchFsRawPreview` + MessageBubble `WorkspaceImage`; honest chip |
| Shopping / maps / html / slides widgets | **partial** | `parseRichWidgets` + RO UI; no commerce writes |
| `permissions.settings.update` Save UI | **partial** | Explicit click; body `network_default`/`connector_default`; protocols[] still RO |
| Outbound `file_ref` | **done** | Official JS path: chunked `fs.write` (+ staging rename); no secrets guessed |
| Shots | 70-prefixed | ui-parity/shots |


## 11. Slice 80 (Trusted Network / proxy / image_options)

| Item | Status | Notes |
|---|---|---|
| Trusted Network Members UI | **partial** | `PeersSection` wires peers.status/list/invites.*/inbox.list/decline/requests.*/disconnect; honest empty; never auto-accept |
| Shared Agents remote | **missing** | Needs Noise connectionClass extension; not faked |
| Per-account proxy | **done** | `accountProxy.ts` + Overview UI; partition `setProxy` + WSS agent; password via safeStorage |
| `image_options` | **partial** | Parse + RO grid; selection write not wired |
| audio/video inbound | **partial** | File chips with audio/* / video/* mime |
| Shots | 80-prefixed | ui-parity/shots |

---

Companion docs: `protocol.md`, `NATIVE_CLIENT.md`, `GAPS.md`, `ACTIVITY.md`, `SCHEDULES.md`, `QUOTA.md`, `ONBOARDING.md`.
