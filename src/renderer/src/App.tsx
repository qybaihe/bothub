import { useEffect } from 'react'
import { AddBotDialog } from '@/components/add-bot/AddBotDialog'
import { ChatArea } from '@/components/chat/ChatArea'
import { AppShell } from '@/components/layout/AppShell'
import { InfoPanel } from '@/components/info/InfoPanel'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { SettingsView } from '@/components/settings/SettingsView'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { UpdateBanner } from '@/components/update/UpdateBanner'
import { useGlobalShortcuts } from '@/lib/shortcuts'
import { startAdapterBridge } from '@/services/adapterBridge'
import { useBotStore } from '@/store/botStore'
import { startPrefsSync, usePrefsStore } from '@/store/prefsStore'

export default function App() {
  const settingsOpen = useBotStore((s) => s.settingsOpen)
  // Details only make sense next to a selected bot (and not while in Settings).
  const infoOpen = useBotStore(
    (s) => !s.settingsOpen && s.infoPanelOpen && s.bots.some((b) => b.id === s.selectedBotId)
  )
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)

  useEffect(() => {
    const stop = startAdapterBridge()
    // After reload the zustand status may still say online, but adapters have
    // no live session — reconnect Muse/Grok/Hark so send does not fail.
    const { accounts, connectAccount, addBot, removeAccountFromBot } = useBotStore.getState()
    for (const account of Object.values(accounts)) {
      if (
        account.platformId === 'meta-muse' ||
        account.platformId === 'grok' ||
        account.platformId === 'hark' ||
        account.platformId === 'dot'
      ) {
        void connectAccount(account.id)
      }
    }
    // Enforce 1-account-per-bot across all bots (remove any extra attached accounts)
    for (const b of useBotStore.getState().bots) {
      if (b.accountIds.length > 1) {
        const keepId = b.activeAccountId && b.accountIds.includes(b.activeAccountId) ? b.activeAccountId : b.accountIds[0]!
        for (const id of b.accountIds) {
          if (id !== keepId) {
            removeAccountFromBot(b.id, id)
          }
        }
      }
    }
    // Auto-hydrate all pre-provisioned Dot accounts from dot-accounts.json (strictly 1 account = 1 bot)
    const dotBridge = typeof window !== 'undefined' ? window.electron?.dot : undefined
    if (dotBridge?.rpc) {
      void dotBridge
        .rpc({ accountId: 'acc_dot_default', op: 'listStoredAccounts' })
        .then((res) => {
          if (!res?.ok || !Array.isArray(res.data)) return
          const storedList = res.data as Array<{
            accountId: string
            handle?: string
            displayName?: string
            planType?: string
          }>
          const validIds = new Set(storedList.map((x) => x.accountId).filter(Boolean))
          // Remove any stale Dot bots/accounts whose account is no longer in dot-accounts.json
          if (validIds.size > 0) {
            useBotStore.setState((s) => {
              const nextAccounts = { ...s.accounts }
              for (const [id, acc] of Object.entries(nextAccounts)) {
                if (acc.platformId === 'dot' && !validIds.has(id)) {
                  delete nextAccounts[id]
                }
              }
              return {
                accounts: nextAccounts,
                bots: s.bots.filter((b) => {
                  if (b.platformId !== 'dot') return true
                  const accId = b.activeAccountId || b.accountIds[0]
                  return Boolean(accId && validIds.has(accId))
                })
              }
            })
          }
          for (const item of storedList) {
            const accId = item.accountId
            if (!accId) continue
            const label = item.handle || item.displayName || accId
            const curState = useBotStore.getState()
            const existingBotForAcc = curState.bots.find(
              (b) =>
                b.platformId === 'dot' &&
                (b.activeAccountId === accId || b.accountIds.includes(accId))
            )
            if (!existingBotForAcc) {
              const botId =
                accId === 'acc_dot_default'
                  ? 'bot_dot_default'
                  : `bot_${accId}`
              addBot({
                id: botId,
                platformId: 'dot',
                name: `Dot · ${label}`,
                emoji: '🪐',
                accounts: [
                  {
                    key: accId,
                    accountId: accId,
                    displayName: label,
                    handle: item.handle ?? label
                  }
                ],
                background: Boolean(curState.selectedBotId)
              })
            } else {
              void curState.connectAccount(accId)
            }
          }
        })
        .catch(() => undefined)
    }
    return stop
  }, [])
  useEffect(() => startPrefsSync(), [])
  useGlobalShortcuts()

  // Test harness for CDP/E2E scripts (dev, or ?e2e=1 / localStorage BOTHUB_E2E).
  useEffect(() => {
    const e2e =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('e2e') === '1' ||
          window.localStorage.getItem('BOTHUB_E2E') === '1'))
    if (!e2e) return
    void import("@adapters/registry").then(({ adapterRegistry }) => {
      ;(window as unknown as { __bothub?: unknown }).__bothub = {
        store: useBotStore,
        prefs: usePrefsStore,
        adapterRegistry
      }
    })
  }, [])

  return (
    <>
      <div className="relative isolate h-full">
        <UpdateBanner />
        <AppShell
          asideOpen={infoOpen}
          sidebar={<Sidebar onAddBot={() => setAddBotOpen(true)} />}
          main={settingsOpen ? <SettingsView /> : <ChatArea />}
          aside={<InfoPanel />}
        />
      </div>
      <AddBotDialog />
      <CommandPalette />
    </>
  )
}
