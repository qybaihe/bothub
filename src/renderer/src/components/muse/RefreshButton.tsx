import { RefreshCw } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <IconButton label={t('Refresh')} size="sm" className="-mr-1.5" disabled={loading} onClick={onClick}>
      <RefreshCw className={cn('!size-3.5', loading && 'animate-spin')} />
    </IconButton>
  )
}
