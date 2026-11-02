import { useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { PlatformAccount, PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { Loader2, Plus, UserRound, X } from 'lucide-react'
import { AccountAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { useBotStore } from '@/store/botStore'
import type { AccountDraft } from '@/types'

export function emptyDraft(): AccountDraft {
  return { key: createId('draft'), displayName: '', handle: '' }
}

export function isDraftFilled(draft: AccountDraft): boolean {
  return draft.displayName.trim().length > 0 || draft.handle.trim().length > 0
}

type SessionsState = { loading: boolean; sessions: PlatformAccount[]; error?: string }

/** Signed-in sessions the platform adapter already knows about. */
function useSignedInSessions(platformId: PlatformId): SessionsState {
  const [state, setState] = useState<SessionsState>({ loading: true, sessions: [] })

  useEffect(() => {
    const adapter = adapterRegistry.get(platformId)
    if (!adapter) {
      setState({ loading: false, sessions: [] })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: undefined }))
    adapter
      .listAccounts()
      .then((sessions) => !cancelled && setState({ loading: false, sessions }))
      .catch(() => !cancelled && setState({ loading: false, sessions: [], error: 'Could not load sessions.' }))
    return () => {
      cancelled = true
    }
  }, [platformId])

  return state
}

interface AccountsEditorProps {
  platformId: PlatformId
  drafts: AccountDraft[]
  onChange: (drafts: AccountDraft[]) => void
  /** Accounts that are already attached (hidden from suggestions). */
  excludeIds?: readonly string[]
  error?: string
}

/**
 * Edit the list of accounts for a bot: pick existing signed-in sessions or
 * add new accounts by name/handle. New accounts connect after saving.
 */
export function AccountsEditor({ platformId, drafts, onChange, excludeIds = [], error }: AccountsEditorProps) {
  const knownAccounts = useBotStore((s) => s.accounts)
  const { loading, sessions, error: sessionsError } = useSignedInSessions(platformId)

  const usedIds = new Set([...excludeIds, ...drafts.flatMap((d) => (d.accountId ? [d.accountId] : []))])
  const suggestions = sessions.filter((s) => !usedIds.has(s.id))

  const update = (key: string, patch: Partial<AccountDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key))

  const addSession = (session: PlatformAccount) => {
    const draft: AccountDraft = {
      key: createId('draft'),
      accountId: session.id,
      displayName: session.displayName,
      handle: session.handle
    }
    // Replace a single untouched blank row instead of stacking below it.
    const blanks = drafts.filter((d) => !d.accountId && !isDraftFilled(d))
    const base = blanks.length === drafts.length ? [] : drafts
    onChange([...base, draft])
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft, index) => {
            const status = draft.accountId ? knownAccounts[draft.accountId]?.status : undefined
            return (
              <li
                key={draft.key}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas/60 p-2 pl-2.5"
              >
                {draft.accountId ? (
                  <>
                    <AccountAvatar name={draft.displayName} status={status} ringClassName="ring-canvas" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui font-medium">{draft.displayName}</p>
                      <p className="truncate text-caption text-ink-muted">{draft.handle} · signed-in session</p>
                    </div>
                  </>
                ) : (
                  <>
                    {isDraftFilled(draft) ? (
                      <AccountAvatar name={draft.displayName || draft.handle} />
                    ) : (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-faint ring-1 ring-line">
                        <UserRound className="size-3.5" aria-hidden />
                      </span>
                    )}
                    <TextInput
                      value={draft.displayName}
                      onChange={(e) => update(draft.key, { displayName: e.target.value })}
                      placeholder="Account name"
                      aria-label={`Account ${index + 1} name`}
                      className="h-8 flex-1"
                      invalid={!!error && !isDraftFilled(draft)}
                    />
                    <TextInput
                      value={draft.handle}
                      onChange={(e) => update(draft.key, { handle: e.target.value })}
                      placeholder="Email or username"
                      aria-label={`Account ${index + 1} email or username`}
                      className="h-8 flex-1"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => remove(draft.key)}
                  aria-label={`Remove account ${draft.displayName || index + 1}`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="text-caption text-status-error-ink" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button variant="ghost" size="sm" className="-ml-1" onClick={() => onChange([...drafts, emptyDraft()])}>
          <Plus aria-hidden /> Add another account
        </Button>
      </div>

      <div className="rounded-xl border border-dashed border-line-strong px-3 py-2.5">
        <p className="mb-2 text-caption font-medium text-ink-muted">Signed-in sessions</p>
        {loading ? (
          <p className="flex items-center gap-1.5 text-caption text-ink-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Looking for sessions…
          </p>
        ) : sessionsError ? (
          <p className="text-caption text-status-error-ink">{sessionsError}</p>
        ) : suggestions.length === 0 ? (
          <p className="text-caption text-ink-muted">All known sessions are already added.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => addSession(session)}
                  title={session.handle}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-1 text-caption font-medium text-ink-secondary shadow-soft transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700"
                >
                  <AccountAvatar name={session.displayName} size="xs" />
                  {session.displayName}
                  <Plus className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
