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

// Names follow the `Platform-用途` convention. No avatarShape/avatarColor: every bot
// gets the app's default Grok Bot mark for its id, like a freshly created bot.
// [id, name, platform, group, description, unread, preview (bot's last message), minutes ago]
const BOTS = [
  ['b-plan', 'Muse-日程助理', 'meta-muse', 'g-daily', '早上排日程，晚上做复盘', 0, '今天下午 3 点和设计评审，已帮你空出 2 点到 3 点', 12],
  ['b-inbox', 'Dot-邮件管家', 'dot', 'g-daily', '归类收件箱、起草回复', 3, '有 3 封需要你回复，草稿已经写好了', 25],
  ['b-meet', 'Hark-会议纪要', 'hark', 'g-daily', '会议记录与待办提取', 0, '周会纪要已整理，共 5 条待办', 95],
  ['b-paper', 'Muse-论文速读', 'meta-muse', 'g-research', '读论文、提炼要点', 0, '这篇的核心贡献有三点：', 60],
  ['b-market', 'Grok-市场调研', 'grok', 'g-research', '竞品与行业动态追踪', 1, '本周竞品动态汇总好了', 38],
  ['b-write', 'Dot-写作搭子', 'dot', 'g-research', '选题、大纲到成稿', 0, '第二版大纲按你的意见改好了', 180],
  ['b-trans', 'Hark-翻译校对', 'hark', 'g-research', '中英日互译与润色', 0, '日文版已校对完毕', 1440],
  ['b-review', 'Grok-代码审查', 'grok', 'g-dev', '看 PR、找隐患', 0, null, 1],
  ['b-ci', 'Muse-CI 值班', 'meta-muse', 'g-dev', '盯构建、整理失败原因', 2, 'Windows 构建失败：缺少签名证书', 7],
  ['b-ops', 'Hark-服务器巡检', 'hark', 'g-dev', '日志、告警和容量', 0, '所有节点正常，磁盘占用 62%', 55],
  ['b-cook', 'Muse-私房菜谱', 'meta-muse', 'g-life', '按冰箱里的食材出菜单', 0, '番茄炒蛋 + 清炒时蔬，20 分钟搞定', 2880],
  ['b-fit', 'Grok-健身教练', 'grok', 'g-life', '训练计划与饮食记录', 0, '明天练腿，记得早点睡', 720],
  ['b-money', 'Dot-记账助手', 'dot', 'g-life', '每月账单汇总', 0, '10 月支出比上月少 12%', 4320]
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
  const messages = {}
  BOTS.forEach(([id, name, platformId, groupId, description, unread, preview, minAgo], i) => {
    const accId = `acc-${id.slice(2)}`
    accounts[accId] = {
      id: accId,
      platformId,
      displayName: name,
      handle: HANDLE[platformId](i + 1),
      status: 'online',
      ...(unread ? { unread } : {})
    }
    bots.push({
      id,
      name,
      emoji: '',
      description,
      platformId,
      groupId,
      accountIds: [accId],
      activeAccountId: accId,
      ...(platformId === 'grok' ? { selectedAgentId: `agent-${id.slice(2)}` } : {}),
      memory: [],
      notes: '',
      createdAt: now - (BOTS.length - i) * 86_400_000,
      unread
    })
    if (preview) {
      messages[id] = [
        { id: `${id}-last`, botId: id, accountId: accId, role: 'bot', text: preview, createdAt: now - minAgo * MIN }
      ]
    }
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

  messages[SELECTED_BOT] = [
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
          '```'
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
          '| 3 | 16 秒 | 16–24 秒 |'
        ].join('\n'),
        8
      ),
      m('m5', 'user', '好，按这个改。顺便帮我把 CI 也配上 macOS 和 Windows。', 2),
      m('m6', 'bot', '收到 👌 我先改重试逻辑并补上单测，然后加一个 macOS + Windows 的构建矩阵，完成后发你 PR 链接。', 1)
  ]

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

/** Fake Grok Bot RPC answers so the inspector shows realistic sections. */
export const GROK_MOCK = {
  ListGrokBotAgentSessions: { sessions: [{ sessionId: 'sess-main', kind: 'main', updatedAtMs: Date.now() - 60_000 }] },
  ListGrokBotAgentAutomations: {
    automations: [
      { id: 'auto-1', name: '每日 PR 巡检', triggerDescription: '工作日 09:30', isEnabled: true },
      { id: 'auto-2', name: '依赖升级提醒', triggerDescription: '每周一 10:00', isEnabled: true },
      { id: 'auto-3', name: '发布前检查', triggerDescription: '每月 1 日 18:00', isEnabled: false }
    ]
  },
  ListGrokBotUserBotMemories: {
    memories: [
      { factId: 'f1', text: '项目使用 TypeScript 严格模式，测试框架是 vitest' },
      { factId: 'f2', text: '提交信息用英文，PR 描述用中文' },
      { factId: 'f3', text: '优先保证 macOS 体验，其次 Windows' }
    ]
  },
  ListGrokBotAgentSkills: {
    skills: [
      { name: 'code-review', description: '按团队规范审查 PR，标出风险和测试缺口' },
      { name: 'ci-triage', description: '读取失败日志，定位原因并给出修复建议' }
    ]
  }
}
