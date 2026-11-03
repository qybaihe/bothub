# muse.ai protocol samples

- `gateway_methods.json` — 387 Noise/HTTP-over-Noise RPC registrations from the web client.
- `proto/` — reconstructed `.proto` for NoiseTransportFrame / ServiceFrame / AttestationBundle (from embedded FileDescriptors in JS).
- `stream/` — `chat.stream` ack + NDJSON `type:event` examples (JS-reconstructed, not plaintext wire).
- `*_example.json` / `*.redacted.json` — request/response shapes with secrets removed.
- `approval_*.json` — Sentinel egress approvals / decide / UI mapping.
- `homepage_bootstrap_redacted.txt` — Next.js RSC bootstrap snippet (VM gateway URL etc.).

Raw Chrome netlogs with cookies/tokens were deleted after analysis.
See `../protocol.md` and `../NATIVE_CLIENT.md`.

- `quota/` — `fetchSubscriptionAction` 脱敏响应；invite 控制面脱敏 JSON。
- `44_POST__.txt` — Server Action 多行响应（subscription + usage）。
- `42_GET__api_hatch_invite.*` — 邀请加额度。
- 定时任务：字段见 `../SCHEDULES.md`（暂无实机 `tasks.list` JSON；有 cookie 后补 `schedules/`）。

- `quota/fetchSubscriptionAction.live.redacted.json` — 实机额度快照（已脱敏）。
- `schedules/tasks.list.live.redacted.json` / `tasks.runs.live.redacted.json` — 实机定时任务列表/运行史（id 已替换）。
