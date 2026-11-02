import { useEffect } from 'react'
import { AddBotDialog } from '@/components/add-bot/AddBotDialog'
import { ChatArea } from '@/components/chat/ChatArea'
import { AppShell } from '@/components/layout/AppShell'
import { InfoPanel } from '@/components/info/InfoPanel'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { startAdapterBridge } from '@/services/adapterBridge'
import { useBotStore } from '@/store/botStore'

export default function App() {
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)

  useEffect(() => startAdapterBridge(), [])

  return (
    <>
      <AppShell
        asideOpen={infoOpen}
        sidebar={<Sidebar onAddBot={() => setAddBotOpen(true)} />}
        main={<ChatArea />}
        aside={<InfoPanel />}
      />
      <AddBotDialog />
    </>
  )
}
