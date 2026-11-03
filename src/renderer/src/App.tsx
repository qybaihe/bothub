import { useEffect } from 'react'
import { AddBotDialog } from '@/components/add-bot/AddBotDialog'
import { ChatArea } from '@/components/chat/ChatArea'
import { AppShell } from '@/components/layout/AppShell'
import { InfoPanel } from '@/components/info/InfoPanel'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { UpdateBanner } from '@/components/update/UpdateBanner'
import { startAdapterBridge } from '@/services/adapterBridge'
import { useBotStore } from '@/store/botStore'

export default function App() {
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)

  useEffect(() => startAdapterBridge(), [])

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
    </>
  )
}
