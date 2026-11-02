import { useState } from 'react'
import { MessagesSquare, PanelRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { IconButton } from '@/components/ui/IconButton'
import { runtimePlatform } from '@/lib/bridge'
import { cn } from '@/lib/cn'

export default function App() {
  const [infoOpen, setInfoOpen] = useState(true)

  return (
    <AppShell
      asideOpen={infoOpen}
      sidebar={
        <header
          className={cn(
            'drag-region flex h-[60px] shrink-0 items-center px-4 pt-2',
            runtimePlatform === 'darwin' && 'pl-[84px]'
          )}
        >
          <span className="text-sm font-semibold tracking-tight">BotHub</span>
        </header>
      }
      main={
        <>
          <PaneHeader>
            <span className="flex-1 font-medium">Conversation</span>
            <IconButton
              label={infoOpen ? 'Hide details' : 'Show details'}
              active={infoOpen}
              onClick={() => setInfoOpen((open) => !open)}
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
