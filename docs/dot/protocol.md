# OpenAI Dot Protocol & API Reference (`chatgpt.com/dots`)

This document describes the authentication, REST endpoints, Server-Sent Events (SSE), and real-time WebSocket JSON-RPC 2.0 protocol used by **OpenAI Dot** (`chatgpt.com/dots`, internally codenamed **Calpico / Orbit / Aeon**) and implemented in BotHub's Dot adapter (`src/main/dot/`).

---

## 1. Authentication & Credential Lifecycle

Dot shares the `chatgpt.com` identity layer and supports three authentication flows in BotHub:

### 1.1 OAuth 2.0 Authorization Code + PKCE
- **Authorization Endpoint**: `https://auth.openai.com/oauth/authorize`
- **Token Endpoint**: `https://auth.openai.com/oauth/token`
- **Client ID**: `app_EMoamEEZ73f0CkXaXp7hrann`
- **Scopes**: `openid profile email offline_access`
- **Refresh Grant**:
  ```json
  {
    "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
    "grant_type": "refresh_token",
    "refresh_token": "<RT>",
    "scope": "openid profile email"
  }
  ```
  Returns `{ "access_token", "refresh_token", "id_token", "expires_in" }`.

### 1.2 Interactive Web Session Extraction
- Users sign in via an isolated Electron `BrowserWindow` (`partition: persist:dot-<accountId>`) at `https://chatgpt.com/dots`.
- Session endpoint: `GET https://chatgpt.com/api/auth/session`
  - Returns `{ "accessToken": "eyJ...", "user": { "id", "email", "name" }, "account": { "id", "planType" } }`.

### 1.3 Direct Token Import (`AT` / `RT`)
- Users can paste a single account or batch list of `access_token` (`eyJ...`), `refresh_token` (`rt_...`), or JSON credential objects (`{ access_token, refresh_token, account_id }`).
- If a `refresh_token` is provided, BotHub automatically refreshes the `access_token` before expiry.

### 1.4 Required Request Headers
All `/backend-api/*` requests require:
- `Authorization: Bearer <access_token>`
- `ChatGPT-Account-Id: <account_id>` (when operating under a specific workspace/account)
- `oai-device-id: <uuid-v4>`
- `oai-language: en-US`
- `oai-client-version: prod-<build_hash>`
- Browser-grade `User-Agent`, `sec-ch-ua`, `Origin: https://chatgpt.com`, and `Referer: https://chatgpt.com/dots` (coupled with Chrome TLS/HTTP2 fingerprint impersonation via `curl-impersonate` when available).

---

## 2. Orbit Profiles & Room Provisioning (`/backend-api/tbo`)

Each Dot instance is an **Orbit Profile** bound to a **Calpico Room** (`calpico_room_id`).

### 2.1 List Orbit Profiles
- `GET https://chatgpt.com/backend-api/tbo/profiles`
- Response:
  ```json
  {
    "profiles": [
      {
        "id": "orbit_...",
        "display_name": "Dot",
        "handle": "dot",
        "calpico_room_id": "room_...",
        "onboarding_completed": true,
        "created_at": "2026-04-01T00:00:00Z"
      }
    ]
  }
  ```

### 2.2 Create / Onboard a New Orbit Profile
- `POST https://chatgpt.com/backend-api/tbo/profiles`
  - Payload: `{ "display_name": "<name>" }`
- `POST https://chatgpt.com/backend-api/tbo/profiles/{orbitProfileId}/complete_onboarding`
  - Payload: `{ "display_name": "<name>", "handle": "<slug>" }`

---

## 3. Calpico Room State, Goal, and Threads (`/backend-api/calpico/rooms`)

### 3.1 Get Room Detail & Long-Term Goal
- `GET https://chatgpt.com/backend-api/calpico/rooms/{roomId}`
- Returns room metadata, current `goal` text, active `threads`, and `main_session_id`.

### 3.2 Update Long-Term Goal
- `PATCH https://chatgpt.com/backend-api/calpico/rooms/{roomId}/goal`
- Payload:
  ```json
  {
    "goal": "<long_term_goal_markdown>"
  }
  ```

### 3.3 List Threads & Thread Messages
- `GET https://chatgpt.com/backend-api/calpico/rooms/{roomId}/threads`
- `GET https://chatgpt.com/backend-api/calpico/rooms/{roomId}/threads/{threadId}/messages?limit=50`
- `GET https://chatgpt.com/backend-api/calpico/rooms/{roomId}/messages?limit=50`

### 3.4 Send Message & Stream SSE Events
- `POST https://chatgpt.com/backend-api/calpico/rooms/{roomId}/messages`
- Payload:
  ```json
  {
    "content": [
      {
        "type": "text",
        "text": "Hello Dot"
      }
    ],
    "thread_id": "<optional_thread_id>"
  }
  ```
- Room SSE stream: `GET https://chatgpt.com/backend-api/calpico/rooms/{roomId}/stream`
  - Emits incremental `message.delta`, `message.completed`, `thread.updated`, and `artifact.created` events.

---

## 4. Real-Time OTP WebSocket JSON-RPC 2.0 (`/backend-api/otp/ws`)

In addition to REST/SSE, Dot uses a bidirectional WebSocket channel for low-latency agent sessions (`main_session_id` / `computer_agent_session_id`):

- **WebSocket Endpoint**: `wss://chatgpt.com/backend-api/otp/ws`
- **Framing**: JSON-RPC 2.0 over WebSocket text frames:
  - Client request:
    ```json
    {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "session.subscribe",
      "params": {
        "room_id": "<calpico_room_id>",
        "session_id": "<main_session_id>"
      }
    }
    ```
  - Server notifications (`method: "session.event"` / `"turn.delta"` / `"turn.completed"`):
    - Stream assistant text deltas, tool invocations, Dynamic Page updates, and file creation events in real time.
    - BotHub keeps the room SSE/WebSocket listener open across turns so asynchronous follow-up messages and background task completions arrive automatically.

---

## 5. Dynamic Pages (`/backend-api/pages`) & File Library (`/backend-api/files/library/nodes`)

### 5.1 Dynamic Pages (Interactive Canvas / Articles)
- **List Pages**: `GET https://chatgpt.com/backend-api/pages?room_id={roomId}`
- **Get Page Content**: `GET https://chatgpt.com/backend-api/pages/{pageKey}`
  - Returns structured page blocks/markdown/HTML that BotHub renders in its side-by-side **Document Canvas**.

### 5.2 File Library & Downloads
- **List Library Nodes**: `GET https://chatgpt.com/backend-api/files/library/nodes?limit=50`
  - Returns generated files (`id: "libfile_..."`, `name`, `mime_type`, `size_bytes`, `created_at`).
- **Download File**:
  - `GET https://chatgpt.com/backend-api/files/download/{fileId}` (resolves signed download URL, then fetches binary content with bearer auth fallback).

---

## 6. Subscription Quota (`/backend-api/wham/usage`) & Cross-Account Memory Migration

### 6.1 Usage & Rate-Limit Windows
- `GET https://chatgpt.com/backend-api/wham/usage`
- Returns `plan_type` (`plus`, `pro`, `team`, `free`) and `rate_limit`:
  - `primary_window`: `{ used_percent, limit_window_seconds, reset_at }` (5h window)
  - `secondary_window`: `{ used_percent, limit_window_seconds, reset_at }` (7d window)

### 6.2 Cross-Account Memory Snapshot & Restore
BotHub supports migrating a Dot agent's state when switching or rotating OpenAI accounts:
1. **Export Snapshot** (`exportDotMemorySnapshot`):
   - Captures the room's `goal`, recent conversation threads/messages, Dynamic Pages, and local notes into a portable JSON snapshot.
2. **Import Snapshot** (`importDotMemorySnapshot`):
   - Applies the saved `goal` to the target account's Calpico room (`PATCH /backend-api/calpico/rooms/{roomId}/goal`) and seeds context into the new room so the new Dot instance resumes seamlessly.
