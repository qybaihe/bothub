# BotHub Protocol & Reverse-Engineering Documentation

This directory contains the protocol specifications, wire-format documentation, and API references for all four personal AI agent platforms integrated into **BotHub**:

| Platform | Directory | Transport & Protocol Highlights |
| --- | --- | --- |
| **OpenAI Dot** (`chatgpt.com/dots`) | [`docs/dot/protocol.md`](./dot/protocol.md) | OAuth PKCE & web session auth, `/backend-api/tbo` Orbit profiles, `/backend-api/calpico/rooms` SSE & REST, `/backend-api/otp/ws` JSON-RPC 2.0 WebSocket, Dynamic Pages (`/backend-api/pages`), Library (`/backend-api/files/library/nodes`), and cross-account memory migration |
| **Meta Muse** (`muse.ai`) | [`docs/museai/protocol.md`](./museai/protocol.md) | `Noise_XX_25519_ChaChaPoly_SHA256` encrypted WebSocket handshake (`wss://www.muse.ai/ws`) and 65+ JSON-RPC methods (`chat.*`, `connectors.*`, `schedules.*`, `fs.*`, `artifacts.*`, `computer.*`, `browser_task.*`, `egress.*`, `peers.*`, `shared_agents.*`) |
| **xAI Grok Bot** (`grok.com`) | [`docs/grokbot-protocol/protocol.md`](./grokbot-protocol/protocol.md) | Connect-RPC unary & server-streaming over HTTP/2 (`grok_bot.v1.GrokBotService/*`, `grok_Comms.v1.ChatRoomCommsService/*`), agent lifecycle, skills, memories, automations, and cloud sandbox |
| **Hark** (`hark.com`) | [`docs/hark/protocol.md`](./hark/protocol.md) | `hark.com/api/*` REST + NDJSON streaming (`/chats/{id}/messages`, `/home/cards`, `/scheduled-tasks`, `/connectors/overview`, `/vm/files/tree`, `/computer/session`, `/billing/subscription`) |
