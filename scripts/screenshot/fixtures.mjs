/**
 * Fictional BotHub workspace for README screenshots.
 * Everything here is made up: no real accounts, emails (example.com only) or tokens.
 */
const MIN = 60_000

const groups = [
  { id: 'g-daily', name: '日常助理' },
  { id: 'g-research', name: '研究与写作' },
  { id: 'g-dev', name: '开发与运维' },
  { id: 'g-life', name: '生活' }
]

// [id, name, emoji, platform, group, shape, color, description, unread, pinned]
const BOTS = [
  ['b-plan', '每日计划', '🗓️', 'meta-muse', 'g-daily', 'squircle', 'blue', '早上排日程，晚上做复盘', 0, true],
  ['b-inbox', '邮件整理', '📮', 'dot', 'g-daily', 'pebble', 'orange', '归类收件箱、起草回复', 3, false],
  ['b-trip', '出行管家', '🧳', 'hark', 'g-daily', 'cloud', 'cyan', '机票、酒店和行程单', 0, false],
  ['b-memo', '随手记', '📝', 'meta-muse', 'g-daily', 'bean', 'yellow', '把零碎想法整理成笔记', 0, false],
  ['b-paper', '论文速读', '📚', 'meta-muse', 'g-research', 'hex', 'violet', '读论文、提炼要点', 0, true],
  ['b-market', '市场调研', '📊', 'grok', 'g-research', 'gem', 'green', '竞品与行业动态追踪', 1, false],
  ['b-write', '公众号写手', '✍️', 'dot', 'g-research', 'leaf', 'red', '选题、大纲到成稿', 0, false],
  ['b-trans', '翻译校对', '🌐', 'hark', 'g-research', 'capsule', 'blue', '中英日互译与润色', 0, false],
  ['b-review', '代码审查', '🧑‍💻', 'grok', 'g-dev', 'shield', 'violet', '看 PR、找隐患', 0, false],
  ['b-ci', 'CI 值班', '🚦', 'meta-muse', 'g-dev', 'tablet', 'green', '盯构建、整理失败原因', 0, false],
  ['b-sql', '数据分析', '🧮', 'dot', 'g-dev', 'square', 'cyan', 'SQL、报表和图表', 0, false],
  ['b-ops', '服务器巡检', '🛰️', 'grok', 'g-dev', 'dome', 'magenta', '日志、告警和容量', 0, false],
  ['b-cook', '私房菜谱', '🍳', 'hark', 'g-life', 'egg', 'orange', '按冰箱里的食材出菜单', 0, false],
  ['b-fit', '健身教练', '🏃', 'meta-muse', 'g-life', 'teardrop', 'red', '训练计划与饮食记录', 0, false],
  ['b-money', '记账小助手', '💰', 'dot', 'g-life', 'egg', 'yellow', '每月账单汇总', 0, false],
  ['b-kids', '亲子阅读', '🧸', 'hark', 'g-life', 'blob', 'violet', '睡前故事与识字卡', 0, false]
]

const HANDLE = {
  'meta-muse': (i) => `muse${i}@example.com`,
  dot: (i) => `dot${i}@example.com`,
  hark: (i) => `hark${i}@example.com`,
  grok: (i) => `@grok_demo_${i}`
}

export const SELECTED_BOT = 'b-review'

export function buildWorkspace(now = Date.now()) {
  const bots = []
  const accounts = {}
  BOTS.forEach(([id, name, emoji, platformId, groupId, avatarShape, avatarColor, description, unread, pinned], i) => {
    const accId = `acc-${id.slice(2)}`
    accounts[accId] = {
      id: accId,
      platformId,
      displayName: name,
      handle: HANDLE[platformId](i + 1),
      status: i % 7 === 3 ? 'offline' : 'online',
      ...(unread ? { unread } : {})
    }
    bots.push({
      id,
      name,
      emoji,
      avatarShape,
      avatarColor,
      description,
      platformId,
      groupId,
      accountIds: [accId],
      activeAccountId: accId,
      memory: [],
      notes: '',
      createdAt: now - (BOTS.length - i) * 86_400_000,
      unread,
      ...(pinned ? { pinned: true } : {})
    })
  })

  const acc = accounts['acc-review'].id
  const t = (minAgo) => now - minAgo * MIN
  const m = (id, role, text, minAgo, extra = {}) => ({
    id,
    botId: SELECTED_BOT,
    accountId: acc,
    role,
    text,
    createdAt: t(minAgo),
    ...(role === 'user' ? { delivery: 'sent' } : {}),
    ...extra
  })

  const messages = {
    [SELECTED_BOT]: [
      m('m1', 'user', '帮我看一下这个重试函数有没有问题，线上偶尔会把同一条消息发两次。', 18),
      m(
        'm2',
        'bot',
        [
          '问题在于**超时后直接重试**：请求可能已经被服务端接收，再发一次就重复了。建议把“已送达”和“失败”分开，并给每条消息带上稳定的 `idempotencyKey`：',
          '',
          '```ts',
          'const key = msg.clientId // 重试时保持不变',
          'try {',
          '  return await api.send({ ...msg, idempotencyKey: key })',
          '} catch (err) {',
          '  if (isAccepted(err)) throw new NoReplyError(err) // 已送达，别再发',
          '  await sleep(backoff(attempt))',
          '}',
          '```',
          '',
          '这样超时只会显示“已送达，等待回复”，用户点重试也不会重复发送。'
        ].join('\n'),
        17
      ),
      m('m3', 'user', '退避时间怎么设比较合适？', 9),
      m(
        'm4',
        'bot',
        [
          '一般用指数退避加随机抖动，避免大家同时重试：',
          '',
          '| 第几次 | 基础等待 | 加抖动后 |',
          '| :--- | :--- | :--- |',
          '| 1 | 4 秒 | 4–6 秒 |',
          '| 2 | 8 秒 | 8–12 秒 |',
          '| 3 | 16 秒 | 16–24 秒 |',
          '',
          '上限建议 30 秒；遇到 401/403 这类登录问题就不要再重试了，直接提示重新登录。'
        ].join('\n'),
        8
      ),
      m('m5', 'user', '好，按这个改。顺便帮我把 CI 也配上 macOS 和 Windows。', 2),
      m('m6', 'bot', '收到 👌 我先改重试逻辑并补上单测，然后加一个 macOS + Windows 的构建矩阵，完成后发你 PR 链接。', 1)
    ]
  }

  return {
    state: {
      groups,
      bots,
      accounts,
      messages,
      selectedBotId: SELECTED_BOT,
      collapsedGroups: {},
      infoPanelOpen: true,
      sidebarCollapsed: false,
      sidebarWidth: 272
    },
    version: 0
  }
}
