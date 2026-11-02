# muse.ai protocol samples

- `gateway_methods.json` — 387 Noise/HTTP-over-Noise RPC method registrations from the web client.
- `*_example.json` / `*.redacted.json` — request/response shapes with secrets removed.
- `homepage_bootstrap_redacted.txt` — snippet of the Next.js RSC bootstrap (VM gateway URL etc.).
- `approval_*.json` — Sentinel `egress.approvals` / `egress.approval` / `egress.approval.decide` shapes + UI→RPC mapping（Allow 抓包 JS 还原；Noise 密文无 wire 明文）。

Raw Chrome netlogs with cookies/tokens were deleted after analysis.
