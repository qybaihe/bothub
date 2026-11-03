# Muse / Hatch — 额度 / Usage / Credits 协议

> 来源：`museai/js/`（尤其 `3rqqoj7iqgyhr.js`、`03rifsq1de5rx.js`、`01b75fkm0a2tw.js`、`0gsxrs76wqu37.js`）+ 抓包样本 `samples/44_POST__.txt`、`samples/42_GET__api_hatch_invite.txt`。  
> 时间：2026-11-03（Asia/Singapore）。Token / cookie / invite code 已脱敏。  
> **未做新的在线调用**：箱内 `.cookies.json` 仅有 meta.ai `ecto_*`，没有 `hatch_*`；额度路径以 JS + 既有 HTTPS 样本为准。

---

## 0. 结论（给 BotHub）

| 问题 | 答案 |
|---|---|
| 额度走 Noise RPC 吗？ | **否**。Settings → Usage 主数据来自 muse.ai **Next.js Server Action**（HTTPS + `hatch_*` cookie） |
| UI 展示什么？ | Settings「Usage」：月度/周度用量百分比、套餐名、额外 tokens（topup）、Upgrade CTA |
| 相关 Noise/网关方法？ | 次要：`subscription.redeem_complimentary`、`subscription.callback`；`wallet.*` 是**支付卡目录**（结账），**不是**额度 |
| 邀请加额度？ | 控制面 `GET /api/hatch/invite`（HTTPS cookie） |
| 置信度 | **高**（有完整响应样本 + UI 字段一一对应）；Server Action 请求体/header 细节 **中**（需带 `Next-Action` 的 POST，hash 会随前端部署变） |

---

## 1. 主路径：`fetchSubscriptionAction`（HTTPS Server Action）

### 1.1 调用方式

- 前端：`createServerReference("409b972cbb33d3e372f4ca9d3c8332677217064f62", …, "fetchSubscriptionAction")`
- 传输：Next App Router **Server Action**（`Next-Action: <hash>`，body 为 RSC/action 编码；响应为 `text/x-component` 风格多行 JSON，见样本 `44_POST__`）
- 参数：`{ includeAgreement?: boolean }`（默认 `true`）
- 鉴权：**`hatch_sess` / `hatch_gw` / `hatch_vml`（及登录态）**；需要 muse.ai 已登录 viewer，**不是** Noise VM token，也**不是** meta.ai `ecto_1_sess`
- 刷新：React Query `staleTime: 6e4`（**60s**），`refetchOnWindowFocus: false`，`retry: 1`；购买/取消后会 `invalidateQueries(['subscription', userId])`

### 1.2 响应 schema（实测样本，已脱敏）

见 `samples/quota/fetchSubscriptionAction.response.redacted.json`：

```json
{
  "success": true,
  "subscription": {
    "tier": {
      "tierId": "hatch_free",
      "name": "Muse Free",
      "tierCode": "HATCH_FREE",
      "isPaid": false,
      "rank": 0
    },
    "usage": {
      "state": "METERED",
      "percentUsed": 3,
      "resetsAt": 1794231590,
      "quotaStatus": "SUFFICIENT"
    },
    "statusSubtitle": "Weekly limit resets on Nov 9",
    "usageRowLabel": "Free plan",
    "usageRowValueLabel": "3% used",
    "usageRowFooter": null,
    "billingSubtitle": null,
    "topupBalance": 160000000,
    "topupTotal": 160000000,
    "topupRowLabel": "Additional tokens",
    "topupRowValueLabel": "0% used (4B tokens left)",
    "topupEligible": true,
    "isEligibleToPurchase": null,
    "entryPointCtaLabel": "Upgrade",
    "managementActions": {
      "primaryCta": null,
      "managementRows": []
    },
    "complimentaryRedeemPage": null,
    "agreement": null
  }
}
```

### 1.3 字段说明

| 字段 | 含义 |
|---|---|
| `tier.*` | 当前套餐；`isPaid` 驱动「有无订阅」 |
| `usage.state` | `METERED` \| `UNLIMITED` \|（UI 还容忍 `UNKNOWN`） |
| `usage.percentUsed` | 0–100，Settings 进度条 |
| `usage.resetsAt` | Unix **秒**，周期重置点 |
| `usage.quotaStatus` | 样本见 `SUFFICIENT`；耗尽态需实机再确认枚举 |
| `usageRow*` / `statusSubtitle` | 服务端已格式化的展示文案（可直接用于 UI） |
| `topupBalance` / `topupTotal` | 额外 token 池；UI：`used% = round(100 * (total - clamp(balance,0,total)) / total)` |
| `topupEligible` | 是否显示「购买额外用量」 |
| `managementActions` | Cancel / Renew / Manage billing / Redeem complimentary 等 CTA |
| `agreement` | 含 `currentPeriodEndTime` 等（`includeAgreement:true` 时） |

免费档样本显示：**周限额**（`statusSubtitle`）+ **额外 tokens 余额**（topup，文案「4B tokens left」）。

---

## 2. 相关 Server Actions（套餐 / 账单）

| Action 名 | Action id（前端 hash，**会随部署变**） | 用途 |
|---|---|---|
| `fetchSubscriptionAction` | `409b972cbb33d3e372f4ca9d3c8332677217064f62` | 读额度 + 套餐状态 |
| `fetchSubscriptionPlansAction` | `4050a605b2be5001e57cf64bba3121a9639546bc74` | 套餐列表 / 升级页 |
| `cancelSubscriptionAction` | `00d40e030ba25d549267489f072508c01e018b4692` | 取消订阅 |
| `reactivateSubscriptionAction` | `0052f080adfe12d799d5339c7f13bf42bc2faa526a` | 恢复订阅 |
| `mintPaymentPortalAction` | `4044828cc13246369b51358c92a32d4f7ebe139ff5` | 打开支付/账单门户 |
| `redeemComplimentarySubscriptionAction` | `002b2a359b5be86d507c0f7bbdd140b56270360317` | 兑换赠送订阅（设置入口） |

BotHub **第一版只接 `fetchSubscriptionAction`（只读额度）**；购买/取消走官方站点或后续再做。

实现注意：hash 变更时可用「登录态下打开 Settings → Usage，抓 `Next-Action`」热更新；或优先封装「用 Electron session 的 cookie 打开 `/` 后调用与网页相同的 server action 通道」。

---

## 3. 控制面 HTTPS（cookie）

### 3.1 邀请加额度

`GET https://muse.ai/api/hatch/invite`  
样本：`samples/quota/hatch_invite.response.redacted.json` / `samples/42_GET__api_hatch_invite.txt`

- `uses_remaining`、`reward`、`code`（脱敏）、兑换文案  
- 用于「额度管理」里的邀请入口，**不是**实时用量条

### 3.2 其它

OIDC / `POST /api/auth/check` / VM wake·lease·token：见 `protocol.md`。额度查询**不需要** Noise VM，但需要有效 hatch 会话 cookie。

---

## 4. 网关方法（易混淆，勿当成额度 API）

| method | path | 实际用途 |
|---|---|---|
| `wallet.get` | `GET /wallet` | 结账用支付方式列表（卡 brand/last4） |
| `wallet.set` | `POST /wallet` | 为某个 approval 选定支付方式 |
| `subscription.redeem_complimentary` | `POST /subscription/redeem-complimentary` | 聊天卡片兑换赠送订阅；响应含 `has_active_subscription` |
| `subscription.callback` | `POST /subscription/callback` | 支付回调类 |
| `grants.list` | `GET /grants` | **权限/peer grants**，非用量额度 |

`gateway_methods.json` **没有** `usage.*` / `quota.*` / `credits.*` RPC。

---

## 5. muse.ai UI 如何展示

1. Settings → **Usage**（埋点 `SETTINGS_USAGE_IMPRESSION`）  
2. Hook：`useSubscription({ includeAgreement })` → `fetchSubscriptionAction`  
3. 渲染：`usage.state===METERED` → 进度条 + `usageRowValueLabel`；另渲染 topup 行「Additional tokens」  
4. Upgrade / Buy additional usage → plans action + Stripe checkout（BotHub 可外链 muse.ai Settings）

---

## 6. BotHub 适配计划（「额度管理」）

### 6.1 存储

- 按 Muse 账号槽：`quotaSnapshot: { fetchedAt, subscription }`（可放 account store；**不要**把 hatch cookie 明文写进日志）
- Cookie 继续走现有 persist partition / safeStorage 会话，与原生 Noise 共用登录态

### 6.2 拉取

```
main: MuseQuotaService.refresh(accountId)
  → 用该账号 hatch cookie 调 fetchSubscriptionAction({ includeAgreement: false })  // 额度条可不带 agreement
  → 解析 success + subscription
  → IPC 推送到 renderer
```

- **Poll**：前台可见时每 **60–120s**；发消息前后各刷一次；窗口 focus 可选刷  
- **Push**：无官方 usage push；勿轮询过勤  
- 失败：保留上次快照 + 标 `stale`；401/未登录提示重新登录 Muse

### 6.3 UI

- Info / 账号面板「额度管理」：  
  - 套餐名 `tier.name`  
  - 主用量：`usageRowLabel` + 进度 `percentUsed` + `statusSubtitle`  
  - 额外 tokens：`topupRowLabel` + `topupRowValueLabel`  
  - 次要：邀请剩余（`/api/hatch/invite`）  
- CTA：`Upgrade` → 系统浏览器打开 `https://muse.ai` Settings（第一版不内嵌 Stripe）

### 6.4 与原生 Noise 的关系

- Noise `chat.stream` **不提供**剩余额度事件（至少前端未订阅此类）  
- 额度耗尽时的 stream 错误码：**未在样本中捕获**；适配时对 send 失败做「刷新额度 + 展示 quota 文案」兜底

### 6.5 实现落点（建议）

| 层 | 文件/模块 |
|---|---|
| HTTPS action 客户端 | `src/main/muse-native/quota.ts`（旁路 Noise，cookie jar 与 `controlPlane.ts` 共用） |
| IPC | `muse:quota:get` / `muse:quota:changed` |
| UI | `InfoPanel` 或 Muse 账号菜单「额度管理」 |

---

## 7. 置信度与缺口

| 项 | 置信度 | 缺口 |
|---|---|---|
| 响应 JSON 形状 | 高 | 付费档 / EXCEEDED 枚举需再抓一条 |
| Server Action hash | 中 | 前端发版会变；应用动态发现或 cookie 会话复用网页通道 |
| `Next-Action` POST 精确 wire | 中 | 样本 `44` 只有响应体；请求 framing 按 Next 惯例补测 |
| wallet / redeem | 高 | 明确非主额度路径 |
| 在线复测 | 低（本次） | 无 `hatch_*` cookie；有 cookie 后应用 `curl`/Electron 复测并更新 `samples/quota/` |

