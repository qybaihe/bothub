import { useEffect } from 'react'
import { ChatArea } from '@/components/chat/ChatArea'
import { AppShell } from '@/components/layout/AppShell'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { startAdapterBridge } from '@/services/adapterBridge'
import { useBotStore } from '@/store/botStore'

export default function App() {
  const infoOpen = useBotStore((s) => s.infoPanelOpen)

  useEffect(() => startAdapterBridge(), [])

  return (
    <AppShell
      asideOpen={infoOpen}
      sidebar={<Sidebar onAddBot={() => undefined} />}
      main={<ChatArea />}
      aside={
        <PaneHeader>
          <span className="font-medium">Details</span>
        </PaneHeader>
      }
    />
  )
}
