# Muse / Hatch — 定时任务 / Schedules 协议

> 来源：`gateway_methods.json` + `js/03rifsq1de5rx.js`、`1fq-79x5ovq07.js`、`3prk5wftwnh26.js`、`0ltorpoeg003-.js`、`1p-4zwr-bo7um.js`、`00hw-sdiuth6w.js`。  
> 时间：2026-11-03（Asia/Singapore）。无在线 `tasks.*` 样本（无 hatch cookie / 未录 schedule 明文）；字段由 JS 反推，**置信度：中高**。

与额度文档分开：额度见 **`QUOTA.md`**（HTTPS Server Action）；定时任务走 **Noise HTTP-over-Noise RPC**。

---

## 0. 结论

| 问题 | 答案 |
|---|---|
| 主 API | `tasks.list` / `tasks.runs` / `tasks.run` / `tasks.delete` / `tasks.subscribe` |
| 列表形状 | `tasks.list` → **`{ schedules: Schedule[] }`**（Settings 权限页直接 `.schedules`） |
| 创建 RPC？ | **网关无 `tasks.create`**。创建靠对话里 agent 落库，活动类型 `scheduled_task_created_activity`；BotHub 创建 = 发 chat 指令或后续补发现 |
| UI 入口 | 导航 `scheduled.tasks` / `scheduled.task`（`task_id`）；Settings 权限里 `scopeType:"schedule"` |
| 易混 | `browser_task.*` = 浏览器会话；`goals.*` = 目标/简报；`pin.*` = PIN 提醒；`feed.prompt.*` = Feed 刷新节奏 |

---

## 1. RPC 一览

| method | HTTP | path | noiseOnly | stream | 作用 |
|---|---|---|---|---|---|
| `tasks.list` | GET | `/tasks` | false | unary | 列出 schedules |
| `tasks.runs` | GET | `/tasks/runs` | false | unary | 运行历史（query 未在 JS 写死，可能带 job 过滤） |
| `tasks.run` | POST | `/tasks/{job_id}/run` | false | unary | **立即触发**一次 |
| `tasks.delete` | DELETE | `/api/tasks/{job_id}` | false | unary | 删除；`requestBody: empty` |
| `tasks.subscribe` | POST | `/tasks/subscribe` | **true** | **subscription** | 任务变更推送 |

均走现有 Noise 网关（与 `chat.stream` 同一 `sendRequest` / BotHub `muse-native/gateway`）。  
`job_id` 路径参数 = schedule 的 `id`（UI/关联里也写作 cron id）。

BotHub `src/main/muse-native/methods.ts` 已注册 `tasks.list` 与 `tasks.subscribe`；需补 **`tasks.runs` / `tasks.run` / `tasks.delete`**。

---

## 2. Schedule 对象（JS 使用到的字段）

反推结构（字段名以 wire/snake 为主，前端偶发 camel）：

```ts
type Schedule = {
  id: string                    // job_id / schedule scope id
  title?: string | null
  schedule_key: string          // 见 §3
  timezone?: string | null      // IANA，如 Asia/Singapore
  is_heartbeat?: boolean
  mode?: string                 // 如 "heartbeat"（与 is_heartbeat 一起过滤）
  enabled?: boolean             // false → UI「paused」
  next_run_at_utc?: number      // Unix 秒
  cadence?: {
    kind: 'runonce' | 'interval' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    run_at_utc?: number
    interval_seconds?: number
    weekdays?: string[]         // sun..sat
    month_days?: number[]
    months?: number[]
  }
  // 权限 inventory 场景还会出现在 owner.scope.schedule_id
}
```

列表排序（官方 UI）：去掉 heartbeat 后按 `next_run_at_utc` 升序，再按 title；`enabled===false` 进 paused 桶。

`tasks.list` 调用例（前端）：

```js
(await sendRequest('tasks.list', {})).schedules
```

---

## 3. `schedule_key` 语法

格式：`{kind}@{payload}`（`o(key)` = `@` 前的 kind）。

| kind | payload 例 | 含义 |
|---|---|---|
| `runonce` | ISO 日期时间 `2026-11-03T12:00:00…` | 单次 |
| `interval` | `15m` / `2h` / `30s`（`^(\d+)([smh])$`） | 固定间隔 |
| `hourly` | （空） | 每小时 |
| `daily` | `HH:MM` | 每日 |
| `weekly` | `{days}-{HH:MM}`，days 为 `sun,mon,…` | 每周 |
| `monthly` | `{doms}-{HH:MM}`，dom 1–31 | 每月 |
| `yearly` | `{months}:{doms}-{HH:MM}` | 每年 |

展示优先：`next_run_at_utc`，否则 `cadence.run_at_utc`，再否则解析 `schedule_key`。

---

## 4. 创建 / 列出 / 删除 / 触发流

```
创建（无专用 RPC）
  用户在 Chat 说「每天早上…」或 UI navigate → agent 执行
  → 活动/widget：scheduled_task_created_activity（列表 UI 可忽略该 widget）
  → 之后出现在 tasks.list.schedules

列出
  tasks.list → schedules[]
  可选 tasks.subscribe 保持同步

详情
  UI：navigate scheduled.task + params.task_id
  深链：?scheduled_task_id=<id>

立即运行
  tasks.run  path job_id=<id>

删除
  tasks.delete  path job_id=<id>

历史
  tasks.runs

权限
  permissions.inventory 含 category scheduled_task
  egress 审批选项：allow_for_this_scheduled_task / deny_for_this_scheduled_task
  scope_type: "schedule" + schedule_id
```

Sentry surface：`hatch.scheduled_task.list` / `hatch.scheduled_task.result`。

---

## 5. 相关但非「定时任务面板」的 API

| 家族 | 用途 | BotHub |
|---|---|---|
| `goals.*` / `goal_prompt` | 长期目标、briefing；association 可挂 `cron`/`job_id` | 可选第二期 |
| `feed.prompt.*` | Feed 自动刷新节奏 | 非用户 cron 列表 |
| `pin.update` / `pin.reminder_confirm` | PIN 提醒加密确认 | 安全设置，非 schedule |
| `browser_task.*` | 远程浏览器任务会话 | 勿并进定时任务 UI |
| `activity.*` | 含 cron `owner_kind` 的活动流 | 可做「最近运行」 |

---

## 6. BotHub 适配建议（定时任务 UI）

### 6.1 数据层

- `MuseSchedulesService`（main，Noise 已连接后）：  
  - `list()` → `tasks.list`  
  - `run(id)` / `remove(id)`  
  - `subscribe()` → 推送 invalidate 列表  
- 缓存：账号槽 `schedules: Schedule[]` + `updatedAt`  
- 创建：**v1 不造假 create RPC**；提供「在对话中创建」快捷短语，或打开 chat 并预填文案

### 6.2 UI

- Muse 侧栏 / Info：「定时任务」  
  - 分组 Active / Paused  
  - 行：title、`schedule_key` 人话（可移植 `1fq` 的格式化逻辑）、下次运行、heartbeat 隐藏  
  - 操作：运行一次、删除、跳转对应会话（若有）  
- 与「额度管理」分入口（额度 = HTTPS；任务 = Noise）

### 6.3 Poll vs Push

- **优先 `tasks.subscribe`**（与 chat 一样 subscription NDJSON）  
- 订阅不可用时：打开面板时 `list`，其后 30–60s 轻轮询  
- 断线重连后重订 subscribe + 全量 list

### 6.4 验收

1. 已登录 Muse 原生连接下 `tasks.list` 返回数组（可空）  
2. 在 muse.ai 网页建一条定时任务后，BotHub 订阅/刷新能看到  
3. `tasks.run` / `tasks.delete` 与网页列表一致  
4. 脱敏日志：不打 cookie / auth token

---

## 7. 置信度

| 项 | 级别 | 说明 |
|---|---|---|
| RPC 名与 path | 高 | 注册表 + methods.ts |
| `.schedules` 列表键 | 高 | Settings 直接使用 |
| `schedule_key` 语法 | 高 | 完整 parser 在 JS |
| Schedule 全字段 / runs 查询参数 | 中 | 缺实机 JSON；补抓后写入 `samples/schedules/` |
| 创建路径 | 中 | 无 create RPC；靠 agent 是产品行为推断 |

