# muse.ai protocol samples

- `gateway_methods.json` — 387 Noise/HTTP-over-Noise RPC registrations from the web client.
- `proto/` — reconstructed `.proto` for NoiseTransportFrame / ServiceFrame / AttestationBundle (from embedded FileDescriptors in JS).
- `stream/` — `chat.stream` ack + NDJSON `type:event` examples (JS-reconstructed, not plaintext wire).
- `*_example.json` / `*.redacted.json` — request/response shapes with secrets removed.
- `approval_*.json` — Sentinel egress approvals / decide / UI mapping.
- `homepage_bootstrap_redacted.txt` — Next.js RSC bootstrap snippet (VM gateway URL etc.).

Raw Chrome netlogs with cookies/tokens were deleted after analysis.
See `../protocol.md` and `../NATIVE_CLIENT.md`.
