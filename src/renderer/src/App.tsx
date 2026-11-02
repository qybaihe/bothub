import { MessagesSquare, PanelRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { IconButton } from '@/components/ui/IconButton'
import { useBotStore } from '@/store/botStore'

export default function App() {
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)

  return (
    <AppShell
      asideOpen={infoOpen}
      sidebar={<Sidebar onAddBot={() => undefined} />}
      main={
        <>
          <PaneHeader>
            <span className="flex-1 font-medium">Conversation</span>
            <IconButton
              label={infoOpen ? 'Hide details' : 'Show details'}
              active={infoOpen}
              onClick={toggleInfoPanel}
            >
              <PanelRight />
            </IconButton>
          </PaneHeader>
          <div className="grid flex-1 place-items-center text-ink-muted">
            <MessagesSquare className="size-6" />
          </div>
        </>
      }
      aside={
        <PaneHeader>
          <span className="font-medium">Details</span>
        </PaneHeader>
      }
    />
  )
}
