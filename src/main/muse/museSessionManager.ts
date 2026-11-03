import { session as electronSession, type BrowserWindow } from 'electron'
import type { MuseMainEvent, MuseSessionStatus, WebViewBounds } from '@shared/ipc'
import { partitionForAccount, WebContentsViewManager } from '../webContentsViewManager'
import { MUSE_HOOK_SCRIPT, museDomSendScript, museRpcScript } from './hookScript'

const MUSE_ORIGIN = 'https://muse.ai'
const AUTH_HOSTS = new Set(['muse.ai', 'www.muse.ai', 'auth.muse.ai', 'auth.meta.com', 'www.meta.com', 'facebook.com', 'www.facebook.com'])

interface AccountSession {
  accountId: string
  botId: string
  viewId: string
  status: MuseSessionStatus
  pollTimer?: ReturnType<typeof setInterval>
}

function isAllowedMuseUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.replace(/^www\./, '')
    if (AUTH_HOSTS.has(u.hostname) || AUTH_HOSTS.has(host)) return true
    return host.endsWith('muse.ai') || host.endsWith('metaaivm.com') || host.endsWith('meta.com') || host.endsWith('facebook.com')
  } catch {
    return false
  }
}


/**
 * Owns muse.ai WebContentsViews and page-side RPC (sendRequest or DOM fallback).
 */
export class MuseSessionManager {
  private readonly sessions = new Map<string, AccountSession>()
  private readonly listeners = new Set<(event: MuseMainEvent) => void>()

  constructor(
    _window: BrowserWindow,
    private readonly views: WebContentsViewManager
  ) {}

  onEvent(listener: (event: MuseMainEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: MuseMainEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[muse] event listener failed', error)
      }
    }
  }

  private emitStatus(accountId: string): void {
    const session = this.sessions.get(accountId)
    if (!session) return
    this.emit({ type: 'status', status: session.status })
  }

  async ensure(botId: string, accountId: string, opts?: { show?: boolean; bounds?: WebViewBounds }): Promise<MuseSessionStatus> {
    let session = this.sessions.get(accountId)
    if (!session) {
      const info = this.views.create({
        botId,
        accountId,
        url: MUSE_ORIGIN,
        label: `Meta Muse · ${accountId}`
      })
      this.configureView(info.viewId, accountId)
      session = {
        accountId,
        botId,
        viewId: info.viewId,
        status: {
          accountId,
          signedIn: false,
          ready: false,
          hook: 'none',
          url: MUSE_ORIGIN,
          pendingApprovals: 0
        }
      }
      this.sessions.set(accountId, session)
      this.startPolling(accountId)
    }

    if (opts?.show && opts.bounds) {
      this.views.attach(session.viewId, opts.bounds)
    }

    await this.refreshSession(accountId)
    return session.status
  }

  private configureView(viewId: string, accountId: string): void {
    const view = this.views.getView(viewId)
    if (!view) return

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedMuseUrl(url)) {
        void view.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })

    view.webContents.on('did-finish-load', () => {
      void this.installHook(accountId)
      void this.refreshSession(accountId)
    })

    view.webContents.on('did-navigate', (_e, url) => {
      const session = this.sessions.get(accountId)
      if (session) {
        session.status.url = url
        this.emitStatus(accountId)
      }
    })
  }

  private async installHook(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId)
    const view = session && this.views.getView(session.viewId)
    if (!view || view.webContents.isDestroyed()) return
    try {
      const result = (await view.webContents.executeJavaScript(MUSE_HOOK_SCRIPT, true)) as {
        ready?: boolean
        hook?: MuseSessionStatus['hook']
      }
      session!.status.ready = Boolean(result?.ready)
      session!.status.hook = result?.hook ?? 'none'
      this.emitStatus(accountId)
    } catch (error) {
      console.error('[muse] hook install failed', error)
      session!.status.ready = false
      session!.status.hook = 'none'
      this.emitStatus(accountId)
    }
  }

  private startPolling(accountId: string): void {
    const session = this.sessions.get(accountId)
    if (!session || session.pollTimer) return
    session.pollTimer = setInterval(() => {
      void this.refreshSession(accountId)
    }, 5000)
  }

  async refreshSession(accountId: string): Promise<MuseSessionStatus | undefined> {
    const session = this.sessions.get(accountId)
    const view = session && this.views.getView(session.viewId)
    if (!session || !view || view.webContents.isDestroyed()) return session?.status

    const partition = partitionForAccount(accountId)
    const ses = electronSession.fromPartition(partition)
    const cookies = await ses.cookies.get({ name: 'hatch_sess' })
    const signedIn = cookies.length > 0 && !/auth\.meta\.com|facebook\.com\/login/i.test(session.status.url)

    if (signedIn !== session.status.signedIn) {
      session.status.signedIn = signedIn
      this.emit({
        type: 'login',
        accountId,
        signedIn,
        handle: signedIn ? undefined : undefined
      })
    }

    session.status.url = view.webContents.getURL()

    if (signedIn) {
      try {
        await this.installHook(accountId)
        if (session.status.hook === 'sendRequest') {
          const pending = await this.rpcRaw(accountId, 'egress.approvals', {})
          const list = normalizeApprovals(pending)
          session.status.pendingApprovals = list.length
          this.emit({ type: 'approvals', accountId, pending: list })
        }
      } catch {
        // Gateway may not be up yet.
      }
    }

    this.emitStatus(accountId)
    return session.status
  }

  getStatus(accountId: string): MuseSessionStatus | undefined {
    return this.sessions.get(accountId)?.status
  }

  async rpc(accountId: string, method: string, params?: unknown): Promise<unknown> {
    await this.ensure('muse', accountId)
    return this.rpcRaw(accountId, method, params)
  }

  private async rpcRaw(accountId: string, method: string, params?: unknown): Promise<unknown> {
    const session = this.sessions.get(accountId)
    const view = session && this.views.getView(session.viewId)
    if (!session || !view) throw new Error(`No muse session for ${accountId}`)

    await this.installHook(accountId)

    if (session.status.hook !== 'sendRequest') {
      if (method === 'chat.stream') {
        const text = extractChatText(params)
        return view.webContents.executeJavaScript(museDomSendScript(text), true)
      }
      throw new Error(`Muse sendRequest unavailable (hook=${session.status.hook}); method ${method} needs gateway`)
    }

    const paramsJson = JSON.stringify(params ?? {})
    return view.webContents.executeJavaScript(museRpcScript(method, paramsJson), true)
  }

  async sendChat(accountId: string, conversationId: string, text: string): Promise<{ messageId: string }> {
    const messageId = `muse_${Date.now().toString(36)}`
    this.emit({
      type: 'stream',
      accountId,
      conversationId,
      messageId,
      text: '',
      done: false
    })

    try {
      const result = await this.rpc(accountId, 'chat.stream', {
        items: [{ type: 'text', text }],
        node_id: accountId,
        capabilities: {}
      })
      const reply = extractReplyText(result) || '(Muse accepted the message; open the web session if the reply is only visible there.)'
      this.emit({ type: 'stream', accountId, conversationId, messageId, text: reply, done: true })
      return { messageId }
    } catch (error) {
      // DOM fallback already attempted inside rpc for chat.stream when hook=dom
      const msg = error instanceof Error ? error.message : String(error)
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId,
        text: `Muse send failed: ${msg}`,
        done: true
      })
      throw error
    }
  }

  destroyAccount(accountId: string): void {
    const session = this.sessions.get(accountId)
    if (!session) return
    if (session.pollTimer) clearInterval(session.pollTimer)
    this.views.destroy(session.viewId)
    this.sessions.delete(accountId)
  }
}

function extractChatText(params: unknown): string {
  if (!params || typeof params !== 'object') return ''
  const items = (params as { items?: Array<{ text?: string }> }).items
  return items?.[0]?.text ?? ''
}

function extractReplyText(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  if (typeof result !== 'object') return String(result)
  const r = result as Record<string, unknown>
  for (const key of ['text', 'message', 'content', 'reply']) {
    const v = r[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  if (Array.isArray(r['items'])) {
    const texts = (r['items'] as Array<{ text?: string; type?: string }>)
      .map((i) => i.text)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
    if (texts.length) return texts.join('\n')
  }
  try {
    return JSON.stringify(result)
  } catch {
    return ''
  }
}

export function normalizeApprovals(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list =
    (obj['pending'] as unknown[]) ||
    (obj['pending_approvals'] as unknown[]) ||
    (Array.isArray(raw) ? (raw as unknown[]) : [])
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const a = (item ?? {}) as Record<string, unknown>
    const id = String(a['approval_id'] ?? a['id'] ?? '')
    const display = (a['display'] as Record<string, unknown> | undefined) ?? {}
    const title = String(
      display['title'] ??
        a['action_description'] ??
        a['action_label'] ??
        a['title'] ??
        a['approval_type'] ??
        'Pending approval'
    )
    return { ...a, id, title }
  })
}

