# Handoff → Claude：Muse 原生客户端（续）

## 已完成（v0.2.0）
原生 Noise_XX + `chat.stream` subscription、重连、approvals。默认 `BOTHUB_MUSE_TRANSPORT=native`。

## 新交付（额度 + 定时任务）

| 文件 | 用途 |
|---|---|
| **QUOTA.md** | 额度/usage/credits：**HTTPS** `fetchSubscriptionAction`，非 Noise |
| **SCHEDULES.md** | 定时任务：`tasks.list/runs/run/delete/subscribe` |
| `samples/quota/*` | 脱敏订阅响应 + invite |
| `samples/44_POST__.txt` | 原始（已无密钥）subscription action 响应 |
| `samples/42_GET__api_hatch_invite.*` | 邀请加额度 |

仍有效：`NATIVE_CLIENT.md`、`protocol.md`、`samples/proto/*`、`samples/stream/*`、`gateway_methods.json`。

## 你要做的

### A. 额度管理（只读优先）
1. `src/main/muse-native/quota.ts`：用账号 **hatch cookie** 调 `fetchSubscriptionAction`（见 QUOTA.md；action hash 可能随前端变）。
2. IPC + Info/账号「额度管理」：套餐、`percentUsed`、topup 文案、重置副标题。
3. Poll 60–120s；**不要**走 `wallet.get`（那是支付卡）。
4. Upgrade CTA → 外开 muse.ai；购买/取消 Server Action 第二期。

### B. 定时任务
1. `methods.ts` 补齐 `tasks.runs` / `tasks.run` / `tasks.delete`（list/subscribe 已有）。
2. `list → .schedules`；UI Active/Paused；运行/删除。
3. 优先 `tasks.subscribe`；**无 `tasks.create`** → 创建靠 chat 指令。
4. 与 browser_task / goals 分开。

## 禁区
不挖 Keychain / CVM recovery；token 脱敏；未批准不 push。

## 优先级
额度只读 UI + 定时任务 list/run/delete → 再考虑 plans/checkout 与 goals。

## Live status / final report / onboarding chips (2026-11-03)

- `ACTIVITY.md` — `agent.status` (`activity_code` / `activity_text` / `activity_emoji`) on `chat.subscribe`
- `FINAL_REPORT.md` — why late “报告” bubbles disappear (early idle settle + new message_id drop)
- `ONBOARDING.md` — welcome chips via widget `kind:"option"` + `widgets.state.set` + `chat.stream`
