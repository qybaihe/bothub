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
      if (event.text) {
        store.applyMessageDelta(event.messageId, event.conversationId, event.accountId, event.text)
      }
      break
    case "approvals":
      if (event.pending.length > 0) store.setAccountStatus(event.accountId, "attention")
      break
    case "login":
      store.setAccountStatus(event.accountId, event.signedIn ? "online" : "offline")
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
        if (event.type !== "auth") return
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
      })
    )
  }

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
