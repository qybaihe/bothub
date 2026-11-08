# Grok Bot 协议材料索引

## 交付物

| 文件 | 说明 | 置信度 |
|---|---|---|
| `protocol.md` | 中文完整协议 + BotHub 建议 | **高**（asar + 本地 blob + 迁移实操交叉验证） |
| `HANDOFF_CLAUDE.md` | Claude 实现 brief | 高 |
| `samples/` | 脱敏 JSON / 方法表 / recipe / transcript | 高（字段来自 proto；请求样例为描述符重建） |
| `checkpoint_*.md` | Antigravity 压缩检查点原文 | 高（会话自我总结） |
| `transcript_full.jsonl` | 原始会话 489 步 | 高 |
| `build_migration.py` | 迁移包生成脚本副本 | 高 |
| `from-mac/` | 脱敏迁移样例、extract、samples 包 | 高 |
| `annotations.pbtxt` | 会话标题元数据 | 高 |

## samples 清单

- `grokbot_service_methods_full.json` — 414 RPC（含块内 SandBox 族）  
- `sandbox_service_methods_full.json` — SandBoxService 55  
- `agentstore_service_methods_full.json` — 25  
- `coordinator_gateway_methods.json` — VM gateway  
- `rpc_schemas_core.json` — 关键消息字段  
- `SendGrokBotUserMessage.*.sample.json`  
- `transcript_replica.sample.json`  
- `roster_last_roster.sample.json` / `sidebar_last_sections.sample.json`  
- `connection_last_host_capabilities.json` / `bot_templates_export_policy.json` / `client_meta_account_slot.json`  
- `recipe_mu.json` / `recipe_bla.json`  
- `persistence_key_encoding.md`  

## 置信度说明

| 断言 | 置信度 | 备注 |
|---|---|---|
| API base = `https://api2.cursor.sh` | **高** | asar 字面量 + `CURSOR_API_BASE_URL` |
| ConnectRPC `aiserver.v1.GrokBotService` 414 方法 | **高** | proto.cjs 完整块解析 |
| `SendGrokBotUserMessage` / `WatchGrokBotTranscripts` 字段 | **高** | proto `$()` 描述符 |
| 本地 blob 键编码与 roster 形状 | **高** | 实文件解码 |
| Auth 头具体名字 / refresh 流程细节 | **中** | 见 `getAccessToken` 模式；未抓 HTTPS 明文 |
| `resolution` 枚举完整列表 | **中低** | 知有 AutoReview 等；枚举值需再抽 JS |
| `https://x.ai/bot` 网页能否替代桌面全功能 | **中低** | 有深链；主路径仍是桌面 RPC |
| CommitTranscript 可无痛注入历史 | **中** | API 存在；迁移未闭环证明 |
| BotHub 应走 RPC 而非纯 WebContents 嵌 App | **高** | 产品形态决定 |

## 额外提取的样本文件

已用 CopyToBox：

- `Downloads/grokbot-migration/{MASTER_MIGRATION,manifest,sync_local_persistence,ALL_MEMORIES_IMPORT}`  
- `Downloads/grokbot-proto-extract.tgz`（关键 step 输出 + blob 摘录）  
- 方法全表 / schemas / samples tarball  

未整包拷贝（体积/敏感）：全部 44 个 transcript 大 blob、完整 asar 解压、`sand-secrets.json` 明文。  
Mac mini `ssh claude` 在分析时不可达；bothub 源码路径以既有约定 `~/projects/bothub` 为准。

## 与 Muse 文档的关系

| | Muse (`docs/museai`) | Grok Bot（本文） |
|---|---|---|
| 传输 | Noise_XX WSS | ConnectRPC HTTPS + 少量 ServerStreaming |
| 嵌入策略 | **必须** WebContentsView 借页面 `sendRequest` | **优先** 原生 RPC；Web 仅辅助登录 |
| 审批 | `egress.approval.decide` | `ResolveGrokBot*` 族 |
| 账号 | Meta OIDC cookies | Cursor/Grok accessToken + accountSlot |

