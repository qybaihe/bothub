import { adapterRegistry } from "@adapters/registry"
import type { AdapterEvent } from "@adapters/types"
import { useBotStore } from "@/store/botStore"

function electronBridge(): Window["electron"] | undefined {
  return typeof window !== "undefined" ? window.electron : undefined
}

function handleEvent(event: AdapterEvent): void {
  const store = useBotStore.getState()
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
          if (!event.done) {
            store.setTyping(convId, true)
            if (event.text) {
              store.applyMessageDelta(event.messageId, convId, event.accountId, event.text)
            }
          } else {
            store.setTyping(convId, false)
            if (event.text) {
              store.receiveMessage({
                id: event.messageId,
                conversationId: convId,
                accountId: event.accountId,
                text: event.text,
                createdAt: Date.now()
              })
            }
          }
        }
      })
    )
  }

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
