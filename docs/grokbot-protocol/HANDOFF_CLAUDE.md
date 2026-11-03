# HANDOFF：BotHub 接入 Grok Bot（给 Claude）

> 读者：Mac mini 上 `~/projects/bothub` 的实现同学（claude）。  
> 协议全文：同目录 `protocol.md`。样例：`samples/`。  
> 约束：**原子 commit、不要 push**；密钥一律 `REDACTED`/勿提交。

## 目标

在 BotHub 增加 **Grok Bot** 平台适配，使 Hub 内出现 Grok Bot 账号下的 Bots，并能：登录（或导入已登录态）、列 Bot、发消息、收流式抄本、处理审批卡；再按用户账号做一轮冒烟。

## 必读

1. `/workspace/grokbot-protocol/protocol.md`（尤其 §0、§2、§3、§5、§9）  
2. `samples/rpc_schemas_core.json`  
3. `samples/grokbot_service_methods_full.json`（414）  
4. 现有 Muse 适配（`src/adapters/*`、`platforms.ts`）——**对齐接口，但传输层不要抄 Noise/WebContents-only**。

## 推荐实现路径（第一期）

**ConnectRPC 原生客户端 + 分区登录**，不要指望嵌整个 `Grok Bot.app`。

### 建议新增文件（路径可按仓库习惯微调）

```
src/adapters/grokbot/
  types.ts              # accountSlot、agent 摘要类型
  connectClient.ts      # @connectrpc/connect → https://api2.cursor.sh
  GrokBotAdapter.ts     # 实现 PlatformAdapter
  approvals.ts          # ResolveGrokBot* 包装
  persistence.ts        # （可选）只读解析 sand-client-persistence 作导入辅助
src/adapters/platforms.ts   # 注册 grokbot：显示名、图标、homeUrl/loginUrl
```

依赖：`@connectrpc/connect`、`@connectrpc/connect-node` 或 web 运输、`@bufbuild/protobuf`。  
若暂不引入完整 proto 生成物：可对**已确认**的几个方法先用手写 JSON/binary 最小客户端，但优先从 asar `proto.cjs` 抽 `.proto` 再 codegen（白鹤本机有 `/Applications/Grok Bot.app`）。

### PlatformAdapter 方法映射

| Adapter 方法（按 bothub `types.ts` 现有约定实现） | Grok RPC / 行为 |
|---|---|
| 登录 / `homeUrl` | 打开 `https://authenticator.cursor.sh` 或产品实际登录入口；成功后存 accessToken。展示可用 `https://x.ai/bot` |
| `listBots` / roster | `ListGrokBotAgents` |
| `sendMessage` | `SendGrokBotUserMessage` + 轮询/订阅 `GetGrokBotSendStatus` |
| `subscribe` / stream | `WatchGrokBotTranscripts`（ServerStreaming）；补洞用 `ListGrokBotTranscriptEntries` |
| 状态灯 | `ListGrokBotAgentStatuses` + roster `hasUnread` / `awaitingUserResponse` |
| 审批 Allow/Deny | `ResolveGrokBotAutoReviewApproval`；本机工具 `ResolveGrokBotLocalToolPermission`；连接器 `ResolveGrokBotConnectorGrant` |
| 多账号 | `session.fromPartition('persist:grokbot-'+slotHash)`；一槽一 token |

### 明确不要做

- 读写/解密用户 `sand-secrets.json`（Keychain/safeStorage）  
- 修改 `Grok Bot.app`  
- 只靠拷贝 `.blob` 伪造成云端 Bot  
- `git push`

## 原子 Commit 建议

1. `feat(adapters): register grokbot platform stub + types`  
2. `feat(grokbot): ConnectRPC client skeleton to api2.cursor.sh`  
3. `feat(grokbot): ListGrokBotAgents → Hub roster`  
4. `feat(grokbot): SendGrokBotUserMessage + WatchGrokBotTranscripts`  
5. `feat(grokbot): approval resolve hooks in UI`  
6. `chore: docs link to grokbot-protocol`（可选）

每条 commit 必须带可编译改动（typecheck/build 过），禁止空 commit。

## 测试计划（用户账号）

用户本机已有 Grok Bot（khiem / `grok|user_…` 槽）。建议：

1. BotHub 添加「Grok Bot」平台 → 完成登录（用户配合 2FA/浏览器）。  
2. 拉到至少一个 agent（默认 Grok Bot 或已迁移的 `mu`/`bla`…）。  
3. 发送 `hi`，确认 Hub 侧出现流式/最终气泡（对拍官方客户端）。  
4. 若出现 Auto-review / 本机权限卡：在 Hub 点 Allow 一次、Deny 一次。  
5. 切换第二个 partition 账号（若有）确认隔离。  
6. **不要**在测试里提交真实 token。

登录若卡在官方桌面 App：可临时用「用户在 Grok Bot 已登录，BotHub 仅深链打开某个 bot」作为 milestone 0，但第一期仍应落地 RPC。

## 把协议文件弄到 Mac mini

在实现机执行（示例）：

```bash
# 从 box/共享盘或 scp
mkdir -p ~/projects/bothub/docs/grokbot
# 将 protocol.md samples/ HANDOFF_CLAUDE.md INDEX.md 拷入上述目录
```

白鹤本机只读证据：`/Applications/Grok Bot.app`、`~/Library/Application Support/Grok Bot/`、`~/Downloads/grokbot-migration/`。

## 完成后回传

请用 SendToAgent 告知：

- 分支与 commit 列表（未 push）  
- typecheck/build 结果  
- 实测：登录是否过、hi 流式、审批  
- 阻塞（token 获取方式、proto 生成等）

