import { adapterRegistry } from "@adapters/registry"
import type { AdapterEvent } from "@adapters/types"
import { useBotStore } from "@/store/botStore"
import { ReplyWatchdog } from "@/store/replyWatchdog"

const STALLED_TEXT = "很久没有收到回复，已停止等待；可以刷新会话或再发一次"
const watchdog = new ReplyWatchdog()

/** Typing is keyed by bot id; events may carry a bot id or an account id. */
function botIdFor(idOrAccount: string): string {
  const { bots } = useBotStore.getState()
  return bots.some((b) => b.id === idOrAccount)
    ? idOrAccount
    : bots.find((b) => b.accountIds.includes(idOrAccount))?.id ?? idOrAccount
}

function touchAccount(accountId: string): void {
  for (const b of useBotStore.getState().bots) if (b.accountIds.includes(accountId)) watchdog.touch(b.id)
}

/** Clear stale "thinking" and flag the unanswered message. */
function checkStalledReplies(): void {
  const store = useBotStore.getState()
  const typingIds = Object.keys(store.typing).filter((id) => store.typing[id])
  const stalled = watchdog.stalled(typingIds, (botId) => {
    const bot = store.bots.find((b) => b.id === botId)
    return Boolean(bot && store.activity[bot.activeAccountId]?.busy)
  })
  for (const botId of stalled) {
    watchdog.forget(botId)
    store.setTyping(botId, false)
    const list = store.messages[botId] ?? []
    const lastUser = [...list].reverse().find((m) => m.role === "user")
    const lastIsUser = list[list.length - 1]?.role === "user"
    if (lastUser && lastIsUser && lastUser.delivery === "sent") {
      useBotStore.setState((s) => ({
        messages: {
          ...s.messages,
          [botId]: (s.messages[botId] ?? []).map((m) =>
            m.id === lastUser.id ? { ...m, delivery: "no-reply" as const, error: STALLED_TEXT } : m
          )
        }
      }))
    }
  }
}

function electronBridge(): Window["electron"] | undefined {
  return typeof window !== "undefined" ? window.electron : undefined
}

function handleEvent(event: AdapterEvent): void {
  const store = useBotStore.getState()
  if (event.type === "message") watchdog.touch(botIdFor(event.message.conversationId))
  else if (event.type === "typing" || event.type === "message_delta") watchdog.touch(botIdFor(event.conversationId))
  else if (event.type === "activity") touchAccount(event.accountId)
  switch (event.type) {
    case "message":
      // Typing state is driven solely by the adapter's typing events, so a
      // reply does not hide the indicator while another one is pending.
      store.receiveMessage(event.message)
      break
    case "typing":
      store.setTyping(event.conversationId, event.isTyping)
      break
    case "status":
      store.setAccountStatus(event.accountId, event.status, event.detail)
      break
    case "message_delta":
      store.setTyping(event.conversationId, true)
      if (
        event.text ||
        event.widgets?.length ||
        event.richWidgets?.length ||
        event.tools?.length ||
        event.media?.length
      ) {
        store.applyMessageDelta(
          event.messageId,
          event.conversationId,
          event.accountId,
          event.text || "",
          event.widgets,
          event.tools,
          event.media,
          event.richWidgets
        )
      }
      break
    case "approvals":
      if (event.pending.length > 0) store.setAccountStatus(event.accountId, "attention")
      break
    case "login":
      store.setAccountStatus(event.accountId, event.signedIn ? "online" : "offline")
      break
    case "activity":
      store.setActivity(event.accountId, {
        code: event.activity.code,
        text: event.activity.text,
        emoji: event.activity.emoji,
        busy: event.activity.busy,
        subagents: event.activity.subagents,
        ctaLabel: event.activity.ctaLabel
      })
      break
  }
}

/**
 * Pipe events from every registered platform adapter into the store.
 * Also listen for main-process Grok auth capture (login window).
 * Returns a cleanup function that unsubscribes all listeners.
 */
export function startAdapterBridge(): () => void {
  const unsubscribers = adapterRegistry.list().map((adapter) => adapter.subscribe(handleEvent))

  const bridge = electronBridge()
  if (bridge?.grok?.onEvent) {
    unsubscribers.push(
      bridge.grok.onEvent((event) => {
        if (event.type === "auth") {
          if (event.signedIn) {
            void useBotStore.getState().setGrokAccessToken(
              event.accountId,
              event.accessToken,
              event.accountSlot,
              event.machineId
            )
          } else {
            useBotStore.getState().setAccountStatus(event.accountId, "offline", "已退出 Grok")
          }
          return
        }
        if (event.type === "stream") {
          const store = useBotStore.getState()
          const convId =
            event.conversationId ||
            store.bots.find((b) => b.accountIds.includes(event.accountId))?.id ||
            event.accountId
          watchdog.touch(botIdFor(convId))
          if (!event.done) {
            store.setTyping(convId, true)
            if (event.text || event.widgets?.length || event.tools?.length || event.media?.length) {
              store.applyMessageDelta(
                event.messageId,
                convId,
                event.accountId,
                event.text || "",
                event.widgets,
                event.tools,
                event.media,
                event.richWidgets
              )
            }
          } else {
            store.setTyping(convId, false)
            if (event.text || event.widgets?.length || event.tools?.length || event.media?.length) {
              store.receiveMessage({
                id: event.messageId,
                conversationId: convId,
                accountId: event.accountId,
                text: event.text || "",
                createdAt: Date.now(),
                widgets: event.widgets,
                tools: event.tools,
                media: event.media,
                richWidgets: event.richWidgets
              })
            }
          }
        }
      })
    )
  }

  const watchdogTimer = setInterval(checkStalledReplies, 15_000)

  return () => {
    clearInterval(watchdogTimer)
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
