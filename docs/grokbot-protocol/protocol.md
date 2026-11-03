# Grok Bot（xAI / Anysphere `sand`）协议分析

> 来源：Antigravity 会话 `f52a9e1d-c52c-4322-a755-e17684c57f8b`（Migrate Grok Bot Configuration，2026-11-02）对  
> `/Applications/Grok Bot.app`（Electron，版本约 `0.78.1`，内部代号 **sand**，Anysphere/Cursor 出品）的静态逆向 + 本机  
> `~/Library/Application Support/Grok Bot/sand-client-persistence` Base32 `.blob` 缓存分析 + 跨账号迁移脚本。  
> **未做完整 net-export 抓包**；ConnectRPC 方法名与消息字段来自 `app.asar` 内 `/dist/electron-main/proto.cjs`。  
> **所有 token / cookie / refresh / machine-id / 账号 UUID 已脱敏为 `REDACTED`。**  
> 解析产物在 `samples/`；迁移参考在 `from-mac/MASTER_MIGRATION.md`（勿把真实记忆内容再扩散）。

---

## 0. 一句话结论

**Grok Bot 不是普通网页聊天，而是 Cursor 系 Electron 桌面客户端（`sand`），通过 ConnectRPC 调 `https://api2.cursor.sh` 上的 `aiserver.v1.GrokBotService`（约 414 个 RPC），并为每个 Bot 租用远端 Linux 沙盒 VM（`*.us12.cursorvm.com` WSS）。**

```
Grok Bot.app (Electron)
  ├─ Renderer UI（roster / transcript / composer）
  ├─ electron-main  ──ConnectRPC/HTTPS──►  api2.cursor.sh
  │     /aiserver.v1.GrokBotService/*     （发消息、名单、记忆、审批…）
  │     /aiserver.v1.SandBoxService/*     （租 VM / store 预签名）
  │     /aiserver.v1.AgentStoreService/*  （25 个 RPC）
  ├─ node-agent-coordinator
  │     jo("gateway") ──WSS──► 沙盒 pod（cursorvm）  sendPrompt / openAgentTail …
  └─ local-exec-daemon（~/.grokbot）── 桥接本机电脑操作
本地缓存：Application Support/Grok Bot/sand-client-persistence/*.blob
密钥：sand-secrets.json（Electron safeStorage，勿强解）
```

与 **muse.ai** 对比：Muse 是 Noise_XX WebSocket 网关，裸客户端极难；Grok Bot 是 **标准 ConnectRPC + Protobuf**，字段可从 `proto.cjs` 还原，**裸客户端可行度远高于 Muse**，但仍需合法登录拿到 `accessToken`（存在 safeStorage，不建议拆钥匙串）。

**BotHub 建议（与 Muse 不同）：**

| 方案 | 说明 | 推荐 |
|---|---|---|
| A. WebContentsView 嵌官方 Web | 有 `https://x.ai/bot/...`、`https://cursor.com/bot/...` 表面，但**主能力在桌面 ConnectRPC**，网页未必覆盖全部 | 仅作登录/展示辅助 |
| B. **ConnectRPC 原生适配器** | 登录后拿 token，调 `SendGrokBotUserMessage` + `WatchGrokBotTranscripts` | **第一期推荐** |
| C. 外启 `Grok Bot.app` + deeplink | `grokbot://` / `sand://` / `https://x.ai/bot/...` | 可作为 fallback，非 Hub 内嵌 |

多账号：用 Electron `session.fromPartition('persist:grokbot-<accountSlot>')` 隔离登录态；**不要**指望只拷 `.blob` 就完成云端迁移（见 §6）。

---

## 1. 产品与身份模型

| 项 | 值 |
|---|---|
| 应用 | `/Applications/Grok Bot.app` |
| 内部名 | `sand`（Anysphere） |
| 文档 | `https://docs.x.ai/grok-bot` |
| Bot 深链 | `https://x.ai/bot/<id>`、`https://x.ai/bot/agent/...` |
| 账号槽位（account slot） | `github\|user_<ULID>` 或 `grok\|user_<ULID>`（URL 编码后 `%7C`） |
| Bot harness | 用户个人 Bot 多为 **`temporal`**；另有 **`box`** 等 |
| 可见性 | 常见 `"visibility": "owner"` |
| 群聊 | `isGroup: true` + `memberIds: [agentId,…]`（对应 CreateChannel / CreateGrokBotRoom） |

本地曾观察到两套账号并存于同一台 Mac：

- 旧：`github|user_…`（配额耗尽）
- 新：`grok|user_…`（切换后 `client-meta.account-slot` 指向新槽）

---

## 2. 认证与主机

### 2.1 API / Auth 主机（`app.asar` 字符串证据）

| 用途 | URL |
|---|---|
| **默认 API Base** | `https://api2.cursor.sh`（可用环境变量 `CURSOR_API_BASE_URL` 覆盖） |
| Origin / 站点 | `https://api.origin.cursor.com`、`https://cursor.com`、`https://www.cursor.com` |
| 认证 | `https://authenticator.cursor.sh`、`https://prod.authentication.cursor.sh` |
| Grok 认证前缀 | `auth.grok.` / `auth.grok-staging.`（与 `api.cursor.` 并列出现在域名规则里） |
| Statsig | `https://api3.cursor.sh/tev1/v1` |
| 更新 | `https://api2.cursor.sh/updates` |
| 连接器网关 | `connectors-gateway.grok.com`、`api.cursor.com` |
| 语音可拨号 | `wss://api.x.ai/`（`DIALABLE_ORIGIN`） |
| OAuth 回调示例 | `grokbot://mcp/oauth/callback`、`https://www.cursor.com/bot/mcp/oauth/callback`、`https://x.com/i/connectors/oauth_callback`、`https://chat.x.com/connectors/oauth_callback`、`https://grok.com/connectors-oauth-exchange-code/` |

登录不是单一「muse OIDC」链路，而是 **Cursor 系账号体系**（可含 GitHub 关联槽或 Grok 槽）。客户端以 **`accessToken` +（可能）`refreshToken`** 调后端；`ie(A.GrokBotService, { backend, getAccessToken, getTeamId, getMachineId })`。

### 2.2 本地密钥与会话

路径：`~/Library/Application Support/Grok Bot/`

| 文件 | 作用 |
|---|---|
| `sand-secrets.json` | `version`、`cursor-machine-id`、`cursor-accounts`、`local-exec-file-key`（**safeStorage 加密字段，禁止在 BotHub 里破解 Keychain**） |
| `Cookies` / `Partitions/` | Chromium 会话；分区名见下 |
| `desktop-status.json` | `{version,pid,appVersion,startedAtMs,signedIn}` |
| `sand-client-persistence/` | 账户维度 UI/副本缓存（明文 JSON blob） |

`Partitions/` 下曾见：`sand-forever-box`、`sand-apps`。

`~/.grokbot/settings.json` 可含 `localToolPermission: "always"`（本机桥接权限）。

### 2.3 ConnectRPC 调用形态

- 库：`@connectrpc/connect` + `@bufbuild/protobuf`
- 路径形如：`/aiserver.v1.GrokBotService/<MethodName>`  
  例：语音 `/aiserver.v1.GrokBotService/VoiceCallHarnessSession`
- 错误：`ConnectError`；自动化失败提示头 `x-automation-failure-hint`（如 `CLOUD_AGENT_STORAGE_DISABLED`、`SAND_BOX_BLOCKED`、`CONCURRENT_LIMIT_EXCEEDED`…）

**完整方法表**：`samples/grokbot_service_methods_full.json`（414）、`sandbox_service_methods_full.json`（55）、`agentstore_service_methods_full.json`（25）。  
注意：`typeName:"aiserver.v1.GrokBotService"` 代码块内也编入了大量 `EnsureSandBox*`（与独立 `SandBoxService` 有重叠/并存，以 asar 为准）。

流式（ServerStreaming）在 GrokBotService 块内至少包括：

- `WatchGrokBotTranscripts`
- `WatchGrokBotUserComputerRequests`
- `OpenGrokBotUserComputerRequest`
- `WatchSandBoxMigration` / `AdminWatchSandBoxMigration`

---

## 3. 发消息与流式（对标 Muse `chat.stream`）

### 3.1 控制面发消息：`SendGrokBotUserMessage`（Unary）

字段描述符（proto `$()`）：

```
SendGrokBotUserMessageRequest
  agent_id, message_id, text, sent_at_ms,
  rich_text?, reply_to_id?, is_fork, reply_quote?,
  attachment_paths[], attachment_names[],
  traceparent?, enter_epoch_ms?, composed_at_ms?,
  source, mcp_config_json?, session_id, machine_id?,
  one_password_app_installed?, initiator, task_id?,
  language?, send_source, first_sent_age_ms?,
  renders_mcp_elicitation_forms?

SendGrokBotUserMessageResponse
  dispatched, mode, workflow_id?, delivery?, refusal?
```

配套：`GetGrokBotSendStatus(agent_id, message_id, session_id, …)` → `status / echo_entry_id / rejection_code / accepted_at_ms`。

样例：`samples/SendGrokBotUserMessage.*.sample.json`、`samples/rpc_schemas_core.json`。

### 3.2 抄本订阅：`WatchGrokBotTranscripts`（ServerStreaming）

```
WatchGrokBotTranscriptsRequest
  cursors[], include_unlisted_agents?, inline_body_max_bytes
```

分页拉取：`ListGrokBotTranscriptEntries(agent_id, generation?, before_seq?, limit, session_id, unread_boundary_ms?)`。

写入/注入（迁移相关）：`CommitGrokBotTranscriptEntries(agent_id, generation, entries[], deletes[], session_id)` → `committed_count / deleted_count / rejections[]`。

### 3.3 协调器 gateway（沙盒侧，非主 API）

`node-agent-coordinator` 注册 `jo("gateway")`，典型方法：

`sendPrompt`、`openAgentTail`、`getAgentTranscriptTail`、`promptAcceptanceStatus`、`respondToWidget`、`resolveAutoReviewApproval`、`resolveLocalToolPermission`、`resolveConnectorGrant`、`resolveVirtualCardApproval` …

见 `samples/coordinator_gateway_methods.json`。  
远端 VM 形如：`wss://<id>-pod-*.us12.cursorvm.com/`（会话里出现过具体 pod，属运行时租约，勿写死）。

### 3.4 本地 transcript 副本形状

`sand.client.slice.account.<slot>.transcript.replicas.<agentId>`：

```json
{
  "schemaVersion": 1,
  "value": {
    "entries": [ /* 最多约 200 条 */ ],
    "epochHint": “…",
    "acceptedSequenceHint": “…",
    "persistedAt": “…",
    "cloudAgentPeerIds": [],
    "precedingTimestampMs": …,
    "unreadAnchor": …
  }
}
```

条目 `kind` 分布（一次全量统计）：`send-message`、`message`、`user-attachment`、`event`。  
`message.type` 常见：`text`、`attachment`、`widget`、`user-form`、`scm-connect`、`cursor-agent`、`email-draft`、`secret-request`。

样例：`samples/transcript_replica.sample.json`。

---

## 4. Bot / 记忆 / Skill / Routine / 模板

### 4.1 名单

- `ListGrokBotAgents` / `CreateGrokBotAgent` / `CreateGrokBotTemporalAgent` / `UpdateGrokBotAgent` / `DeleteGrokBotAgent`
- Roster 本地缓存字段（节选）：`id, name, description, harness, visibility, avatarShape, avatarColor, voiceId, isGroup, memberIds, path(/home/box/sand-data/agents/<id>/store.db), lastEntry, lastMessageId, unreadCount, …`

**重要**：服务端 `ListGrokBotAgents` 返回后，客户端会丢掉「本地 temporal 缓存里有、但服务端名单没有」的行（`harness === "temporal"` 过滤）。**只改 `.blob` 无法持久化伪造 Bot。**

### 4.2 记忆 / Skill / Automation

- `ListGrokBotUserBotMemories` / 相关 Promote*
- `AddGrokBotAgentSkill` / `UpdateGrokBotAgentSkill` / `RemoveGrokBotAgentSkill`
- `ListGrokBotAgentAutomations`、`SetGrokBotAgentAutomationEnabled`、`SetGrokBotAgentRoutineEnabled`、`DeleteGrokBotAgentAutomation`

### 4.3 Template Recipe（官方配置迁移载体）

`CreateGrokBotTemplate` → 激活 `ActivateGrokBotTemplateVersion` → 新账号 `CreateGrokBotAgentFromTemplate`。  
Recipe JSON schema（`main-app.cjs` / 迁移脚本使用，≤25MB）：

```json
{
  "profile": { "name", "description", "avatarColor", "avatarShape" },
  "memory": [{ "kind": "profile"|"log", "createdAt?", "content" }],
  "skills": [{ "name", "description", "content" }],
  "routines": [{ "name", "slug", "description", "content" }],
  "plugins": [{ "name", "description", "pluginId" }],
  "gettingStarted": { "skill": "…" }
}
```

样例：`samples/recipe_mu.json`、`samples/recipe_bla.json`。  
账号 `bot-templates.export-policy` 可为 `{"exportPolicy":"all"}`。

公开分享链：`https://x.ai/bot/...`；UI 也可触发 “Share a template link”。

### 4.4 跨账号共享（保留同一实例）

- `CreateGrokBotAgentAccessInvite` / `AcceptGrokBotAgentAccessInvite`
- Team：`ShareGrokBotAgentInPlace` / `CloneGrokBotAgentToTeam` / `AddGrokBotAgentManager`

### 4.5 云端数据落点

| 位置 | 内容 |
|---|---|
| 服务端 GrokBotService | profile、skills、memories、automations、plugins、transcript、secrets 元数据 |
| 沙盒 `/home/box/sand-data/agents/<id>/store.db` | 代理本地 SQLite |
| `/home/box/agent-data/agents/<id>/` | assets / attachments |
| `/workspace/` | 工作区文件 |
| 本机 `.blob` | roster/sidebar/transcript 近端缓存（非权威） |

---

## 5. 审批 / 授权（对标 Muse `egress.approval.decide`）

Grok Bot **没有** Muse Sentinel 那套 `egress.*`，但有多类「确认卡」RPC：

| RPC | 用途 |
|---|---|
| `ResolveGrokBotAutoReviewApproval` | Auto-review：`agent_id, request_id, resolution, approval_platform, approved_command?, session_id?, mcp_elicitation_content?` |
| `ResolveGrokBotLocalToolPermission` | 本机工具权限 |
| `ResolveGrokBotConnectorGrant` | 连接器授权 |
| `ResolveGrokBotVirtualCardApproval` | 虚拟卡 |
| `BeginGrokBotSpendApproval` | 花费审批 |
| `RespondGrokBotWidget` / `SubmitGrokBotSecret` / `SubmitGrokBotUserForm` | Widget / 密钥 / 表单 |
| `WatchGrokBotUserComputerRequests` + `SubmitGrokBotUserComputerResponses` | 本机电脑操作请求流 |

Coordinator gateway 侧同名能力：`resolveAutoReviewApproval` 等。  
**具体 `resolution` 枚举取值**在 asar 有 `Dt("approval resolution", …)`，本次未完整展开枚举表——实现时从 renderer chunk 再抽一轮。

连接器启动：`StartGrokBotSlackConnect` / `StartGrokBotTeamsConnect` / `StartGrokBotXConnect` 等。

Host capabilities 缓存示例：

```json
["attachmentStoreSizedV1","orderedReplicasV1","sendAcceptanceV1","voiceSettingsV1","botTemplateJsonShareV1","botTemplateVisibilityV1"]
```

---

## 6. 本地 persistence 编码

见 `samples/persistence_key_encoding.md`。

关键 slice（账户下）：

- `roster.last-roster`
- `sidebar.last-sections`
- `selection.last-agent`
- `ui-agent-refs`
- `transcript.replicas.<agentId>`
- `composer-drafts.<agentId>`
- `connection.last-host-capabilities`
- `bot-templates.export-policy`
- `cloud-agents.infos`
- `experiments.last-latched-gates`
- `weekly-usage.cache`
- …

全局：`sand.client.slice.client-meta.account-slot`、`sand.client.slice.ui-layout` 等。

---

## 7. Deeplink

| Scheme / URL | 用途 |
|---|---|
| `https://x.ai/bot/<id>` | Bot / 模板入口 |
| `https://cursor.com/grok-bot/link/v1/...` | 链接动作（含 finance 等） |
| `https://cursor.com/bot/onboarding` | 引导 |
| `grokbot://…` / `grokbot://mcp/oauth/callback` | 应用协议 / MCP OAuth |
| `sand://anysphere.sand-deeplink/v1/settings?id=import-memory` | 设置页（会话中迁移用到过 Import Memory） |
| `grokbot://app/v1/prompt?...` | 向 Bot 塞 prompt（迁移总控用过） |

---

## 8. 迁移会话结论（成功 / 未完成）

**已完成（证据充分）：**

1. 完整摸清 sand 架构、414 RPC 目录、本地 blob 键空间、roster/transcript 形状。  
2. 备份 44 个 `.blob` → Antigravity `scratch/persistence-backup/`。  
3. 生成 `/Users/baihe/Downloads/grokbot-migration/`：`MASTER_MIGRATION.md`、`ALL_MEMORIES_IMPORT.md`、`manifest.json`、每 Bot 的 `BOOTSTRAP.md` / `recipe.json` / `transcript.md|json`、`sync_local_persistence.py`。  
4. 明确：**仅 re-key `.blob` 会被 `ListGrokBotAgents` 冲掉**；正确路径是新账号上 `CreateAgent`/`CreateGrokBotAgentFromTemplate` + 记忆/skill/routine 写入，再可选 `CommitGrokBotTranscriptEntries` 或 BOOTSTRAP 气泡回放。  
5. `sync_local_persistence.py`：按**名字**把 sidebar / drafts / transcript 副本映射到新 UUID。

**未完成 / 风险：**

- 服务端「原声气泡」100% 逐条注入依赖 `CommitGrokBotTranscriptEntries` 与 generation/epoch 对齐，会话结束时**未证明**已对所有 Bot 跑通。  
- `sand-secrets.json` 未（也不应）解密；新账号 token 只能通过正规登录获得。  
- GitHub App / 连接器授权、本机 daemon 凭据**不会**随 recipe 自动过户。  
- Antigravity 线程是「迁移」不是「BotHub 适配」——**没有现成 GrokAdapter 代码**。

---

## 9. BotHub 适配建议（给实现者）

### 9.1 推荐架构（第一期）

1. **Platform id**：`grokbot`（或 `grok-bot`）。  
2. **登录**：WebContentsView / 专用 BrowserWindow 打开 Cursor/Grok 登录（`authenticator.cursor.sh` 或应用内等价流），partition = `persist:grokbot-<hash(accountSlot)>`；登录成功后由用户完成，**或**引导用户在本机已登录的 Grok Bot 中导出/粘贴 session（若产品允许）。**禁止**自动拆 Keychain。  
3. **运行时**：用 `@connectrpc/connect` 指向 `https://api2.cursor.sh`，`Authorization: Bearer <accessToken>`（头名字以客户端实际为准，实现时从 `main-app.cjs` 再确认一次）。  
4. **核心方法映射**：
   - 列表：`ListGrokBotAgents`
   - 发消息：`SendGrokBotUserMessage`（+ `GetGrokBotSendStatus`）
   - 收流：`WatchGrokBotTranscripts` / `ListGrokBotTranscriptEntries`
   - 状态灯：`ListGrokBotAgentStatuses`、unread 字段、`awaitingUserResponse`
   - 审批：`ResolveGrokBotAutoReviewApproval` 等（UI 卡对接 BotHub 确认条）
5. **多账号**：一 accountSlot 一 partition + 一 token 存储项（BotHub 自己的安全存储，不是改 Grok Bot 的 sand-secrets）。  
6. **不要**第一期复刻 Noise 式「整页嵌入 Grok Bot.app」；桌面 asar 无法当普通 URL 嵌。若只要「看着像官方 UI」，二期可评估嵌 `https://x.ai/bot/...` 已登录页，但仍需 RPC 做 Hub 侧控制。

### 9.2 与 MuseAdapter 对齐的接口期望

| BotHub 能力 | Grok 侧 |
|---|---|
| `homeUrl` / 嵌入 | 登录页 URL 或 `https://x.ai/bot`；主聊天走 RPC |
| `sendMessage` | `SendGrokBotUserMessage` |
| `subscribeTranscript` | `WatchGrokBotTranscripts` |
| `listBots` | `ListGrokBotAgents` |
| `approve/deny` | `ResolveGrokBot*` 系列 |
| `importAccount` | 登录 partition + 拉 roster |

### 9.3 明确不要做的事

- 破解 `sand-secrets.json` / Keychain  
- 篡改 `Grok Bot.app` / `app.asar`  
- 把旧账号 blob 直接改名当成新账号权威状态  
- 臆造未在 asar/会话中出现的 API 路径  

---

## 10. 证据索引

| 材料 | 路径 |
|---|---|
| 本协议 | `protocol.md` |
| RPC 全表 | `samples/grokbot_service_methods_full.json` 等 |
| 字段 schema | `samples/rpc_schemas_core.json` |
| 缓存样例 | `samples/roster_*.json`、`transcript_replica.sample.json` |
| 迁移总控（参考） | `from-mac/MASTER_MIGRATION.md` |
| 会话检查点 | `checkpoint_153.md` / `308.md` / `473.md` |
| 原始 transcript | `transcript_full.jsonl` |
| 步骤摘录 | `from-mac/extract/steps/*.txt` |

