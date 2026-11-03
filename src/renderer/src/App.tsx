import { useEffect } from 'react'
import { AddBotDialog } from '@/components/add-bot/AddBotDialog'
import { ChatArea } from '@/components/chat/ChatArea'
import { AppShell } from '@/components/layout/AppShell'
import { InfoPanel } from '@/components/info/InfoPanel'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { UpdateBanner } from '@/components/update/UpdateBanner'
import { useGlobalShortcuts } from '@/lib/shortcuts'
import { startAdapterBridge } from '@/services/adapterBridge'
import { useBotStore } from '@/store/botStore'

export default function App() {
  // Details only make sense next to a selected bot.
  const infoOpen = useBotStore((s) => s.infoPanelOpen && s.bots.some((b) => b.id === s.selectedBotId))
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)

  useEffect(() => {
    const stop = startAdapterBridge()
    // After reload the zustand status may still say online, but adapters have
    // no live session — reconnect Muse/Grok so send does not fail.
    const { accounts, connectAccount } = useBotStore.getState()
    for (const account of Object.values(accounts)) {
      if (account.platformId === 'meta-muse' || account.platformId === 'grok') {
        void connectAccount(account.id)
      }
    }
    return stop
  }, [])
  useGlobalShortcuts()

  // Dev-only test harness for CDP/E2E scripts.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    void import("@adapters/registry").then(({ adapterRegistry }) => {
      ;(window as unknown as { __bothub?: unknown }).__bothub = {
        store: useBotStore,
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
          main={<ChatArea />}
          aside={<InfoPanel />}
        />
      </div>
      <AddBotDialog />
      <CommandPalette />
    </>
  )
}
