import { BrowserWindow, session as electronSession } from 'electron'
import type { MuseMainEvent, MuseSessionStatus, WebViewBounds } from '@shared/ipc'
import { partitionForAccount, WebContentsViewManager } from '../webContentsViewManager'
import { MUSE_HOOK_SCRIPT, museDomSendScript, museRpcScript } from './hookScript'
import { applyMuseKeepAlive, MUSE_HEALTH_SCRIPT, museWakeScript } from './museKeepAlive'

const MUSE_ORIGIN = 'https://muse.ai'
const AUTH_HOSTS = new Set(['muse.ai', 'www.muse.ai', 'auth.muse.ai', 'auth.meta.com', 'www.meta.com', 'facebook.com', 'www.facebook.com'])

interface AccountSession {
  accountId: string
  botId: string
  viewId: string
  status: MuseSessionStatus
  /** Watchdog: when the gateway was last seen not ready (ms). */
  notReadySince?: number
  wakeRetry?: number
  nextWakeAt?: number
  reloadAfterMs?: number
  lastReloadAt?: number
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
  /** Interactive login windows keyed by accountId (same persist partition). */
  private readonly loginWindows = new Map<string, BrowserWindow>()

  constructor(
    private readonly window: BrowserWindow,
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
    // Recreate if the underlying WebContentsView was destroyed externally.
    if (session && !this.views.getView(session.viewId)) {
      if (session.pollTimer) clearInterval(session.pollTimer)
      this.sessions.delete(accountId)
      session = undefined
    }
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
          pendingApprovals: 0,
          phase: 'connecting'
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

    void applyMuseKeepAlive(view.webContents)
    view.webContents.on('dom-ready', () => {
      void applyMuseKeepAlive(view.webContents)
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

    await this.watchdog(accountId)
    this.emitStatus(accountId)
    return session.status
  }

  /**
   * Health watchdog. Mirrors the official client's recovery path:
   *  1. keep page visible/active (rAF-driven SSR reveal + hydration),
   *  2. POST /api/hatch/vm/wake {vm_id, retry_count} with backoff,
   *  3. full reload with growing backoff if still not hydrated.
   */
  private async watchdog(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId)
    const view = session && this.views.getView(session.viewId)
    if (!session || !view || view.webContents.isDestroyed()) return
    const st = session.status
    if (!st.signedIn) {
      st.phase = 'signed-out'
      st.phaseDetail = 'Sign in to muse.ai in the web session'
      session.notReadySince = undefined
      return
    }
    if (st.hook === 'sendRequest') {
      st.phase = 'ready'
      st.phaseDetail = undefined
      session.notReadySince = undefined
      session.wakeRetry = 0
      session.nextWakeAt = undefined
      session.reloadAfterMs = undefined
      return
    }

    const now = Date.now()
    session.notReadySince ??= now
    const elapsed = now - session.notReadySince

    let health: { visibility?: string; bodyLen?: number; store?: boolean; loginUi?: boolean; vmId?: string | null } = {}
    try {
      health = (await view.webContents.executeJavaScript(MUSE_HEALTH_SCRIPT, true)) ?? {}
    } catch {
      /* page mid-navigation */
    }
    if (health.visibility === 'hidden') await applyMuseKeepAlive(view.webContents)
    if (health.loginUi) {
      st.phase = 'signed-out'
      st.phaseDetail = 'muse.ai shows the login page'
      return
    }
    st.phase = health.bodyLen ? 'connecting' : 'hydrating'
    st.phaseDetail = health.bodyLen ? 'Connecting to Muse gateway…' : 'Loading muse.ai…'

    if (elapsed > 20_000 && health.vmId && now >= (session.nextWakeAt ?? 0)) {
      const retry = session.wakeRetry ?? 0
      try {
        const res = (await view.webContents.executeJavaScript(museWakeScript(health.vmId, retry), true)) as {
          status: number
          body: string
        }
        console.info('[muse] vm wake', accountId, res?.status, res?.body)
      } catch {
        /* ignore */
      }
      session.wakeRetry = retry + 1
      session.nextWakeAt = now + Math.min(5_000 * 2 ** retry, 60_000)
      st.phase = 'waking-vm'
      st.phaseDetail = `Waking Muse VM (attempt ${retry + 1})…`
    }

    const reloadAfter = session.reloadAfterMs ?? 45_000
    if (now - (session.lastReloadAt ?? session.notReadySince) > reloadAfter) {
      session.lastReloadAt = now
      session.reloadAfterMs = Math.min(reloadAfter * 2, 300_000)
      st.phase = 'reloading'
      st.phaseDetail = 'Reloading muse.ai to rehydrate…'
      await applyMuseKeepAlive(view.webContents)
      view.webContents.reloadIgnoringCache()
    }
  }

  getStatus(accountId: string): MuseSessionStatus | undefined {
    return this.sessions.get(accountId)?.status
  }

  async rpc(accountId: string, method: string, params?: unknown): Promise<unknown> {
    await this.ensure('muse', accountId)
    if (method === 'chat.stream') {
      return this.chatStreamAndCollect(accountId, params)
    }
    return this.rpcRaw(accountId, method, params)
  }

  /**
   * chat.stream is streamMode=subscription: the RPC ack is only
   * {message_id,session_id}. Poll chat.history for the assistant reply.
   */
  private async chatStreamAndCollect(accountId: string, params: unknown): Promise<unknown> {
    const ack = (await this.rpcRaw(accountId, 'chat.stream', params)) as Record<string, unknown>

    // DOM fallback path already scraped page text.
    if (ack && ack['ok'] === true && ack['mode'] === 'dom') {
      const reply = typeof ack['reply'] === 'string' ? (ack['reply'] as string) : ''
      return { ...ack, text: reply, display_text: reply, reply }
    }

    const sessionId = typeof ack?.['session_id'] === 'string' ? (ack['session_id'] as string) : ''
    const messageId = typeof ack?.['message_id'] === 'string' ? (ack['message_id'] as string) : ''
    if (!sessionId || !messageId) {
      return ack
    }

    const reply = await this.waitForAssistantReply(accountId, sessionId, messageId)
    if (!reply) return ack
    return { ...ack, text: reply, display_text: reply, reply }
  }

  private async waitForAssistantReply(
    accountId: string,
    sessionId: string,
    userMessageId: string,
    timeoutMs = 90_000
  ): Promise<string> {
    const started = Date.now()
    let userAt = 0
    let best = ''

    while (Date.now() - started < timeoutMs) {
      let hist: unknown
      try {
        hist = await this.rpcRaw(accountId, 'chat.history', { session_id: sessionId, limit: 30 })
      } catch {
        await sleep(800)
        continue
      }
      const events = extractChatEvents(hist)
      if (!userAt) {
        const userEvt = events.find((e) => e.messageId === userMessageId)
        if (userEvt) userAt = userEvt.occurredAt
      }
      const assistants = events.filter(
        (e) =>
          e.eventName === 'message.assistant' &&
          e.text.trim() &&
          (userAt ? e.occurredAt > userAt : e.messageId !== userMessageId)
      )
      // Newest assistant after the user turn.
      assistants.sort((a, b) => b.occurredAt - a.occurredAt)
      const top = assistants[0]
      if (top) {
        best = top.text
        // Prefer a settled reply (ready flag) or stop once we have text and
        // nothing changed for a couple polls — history is eventual.
        if (top.ready || best.length > 0) {
          // Give streaming a moment to finish if not marked ready.
          if (top.ready) return best
          await sleep(1200)
          // one more read
          try {
            hist = await this.rpcRaw(accountId, 'chat.history', { session_id: sessionId, limit: 30 })
            const again = extractChatEvents(hist)
              .filter(
                (e) =>
                  e.eventName === 'message.assistant' &&
                  e.text.trim() &&
                  (userAt ? e.occurredAt > userAt : true)
              )
              .sort((a, b) => b.occurredAt - a.occurredAt)[0]
            if (again?.text) return again.text
          } catch {
            /* ignore */
          }
          return best
        }
      }
      await sleep(800)
    }
    return best
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


  /**
   * Open a dedicated BrowserWindow that shares the account's persist partition
   * and loads muse.ai. Meta/Facebook auth redirects stay in-window. When the
   * `hatch_sess` cookie appears, emit login, reload the embedded view, and close.
   */
  async openLogin(botId: string, accountId: string): Promise<MuseSessionStatus> {
    await this.ensure(botId, accountId)
    const refreshed = await this.refreshSession(accountId)
    if (refreshed?.signedIn) return refreshed

    const existing = this.loginWindows.get(accountId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return this.sessions.get(accountId)!.status
    }

    const partition = partitionForAccount(accountId)
    const win = new BrowserWindow({
      width: 1040,
      height: 780,
      minWidth: 720,
      minHeight: 560,
      title: '使用 Muse 登录',
      backgroundColor: '#f7f7f8',
      autoHideMenuBar: true,
      parent: this.window.isDestroyed() ? undefined : this.window,
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    this.loginWindows.set(accountId, win)

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedMuseUrl(url)) {
        void win.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })

    const ses = electronSession.fromPartition(partition)
    let settling = false

    const finishIfSignedIn = async (): Promise<void> => {
      if (settling || win.isDestroyed()) return
      const cookies = await ses.cookies.get({ name: 'hatch_sess' })
      const url = win.webContents.getURL()
      const onAuthHost = /auth\.meta\.com|facebook\.com\/login|auth\.muse\.ai/i.test(url)
      if (cookies.length === 0 || onAuthHost) return

      settling = true
      try {
        await this.refreshSession(accountId)
        const session = this.sessions.get(accountId)
        const view = session && this.views.getView(session.viewId)
        if (view && !view.webContents.isDestroyed()) {
          try {
            await view.webContents.loadURL(MUSE_ORIGIN)
          } catch (error) {
            console.error('[muse] reload embedded view after login failed', error)
          }
        }
        await this.refreshSession(accountId)
      } finally {
        if (!win.isDestroyed()) win.close()
      }
    }

    const onNav = () => {
      void finishIfSignedIn()
    }
    win.webContents.on('did-finish-load', onNav)
    win.webContents.on('did-navigate', onNav)
    win.webContents.on('did-navigate-in-page', onNav)
    win.webContents.on('did-redirect-navigation', onNav)

    const onCookie = (
      _event: unknown,
      cookie: { name: string },
      _cause: string,
      removed: boolean
    ) => {
      if (!removed && cookie.name === 'hatch_sess') void finishIfSignedIn()
    }
    ses.cookies.on('changed', onCookie)

    win.on('closed', () => {
      ses.cookies.off('changed', onCookie)
      this.loginWindows.delete(accountId)
      void this.refreshSession(accountId)
    })

    try {
      await win.loadURL(MUSE_ORIGIN)
    } catch (error) {
      console.error('[muse] openLogin load failed', error)
    }
    return this.sessions.get(accountId)!.status
  }

  /** Tear down the view and wipe the persist partition (full sign-out). */
  async signOut(accountId: string): Promise<void> {
    this.destroyAccount(accountId)
    await this.views.clearPartition(accountId)
    this.emit({ type: 'login', accountId, signedIn: false })
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


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ChatEventLite {
  messageId: string
  eventName: string
  text: string
  occurredAt: number
  ready: boolean
}

function extractChatEvents(raw: unknown): ChatEventLite[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list =
    (obj['chat_events'] as unknown[]) ||
    (obj['events'] as unknown[]) ||
    (Array.isArray(raw) ? (raw as unknown[]) : [])
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const e = (item ?? {}) as Record<string, unknown>
    return {
      messageId: String(e['message_id'] ?? e['id'] ?? ''),
      eventName: String(e['event_name'] ?? e['type'] ?? ''),
      text: String(e['display_text'] ?? e['text'] ?? e['content'] ?? ''),
      occurredAt: Number(e['occurred_at_ms'] ?? e['created_at_ms'] ?? 0) || 0,
      ready: e['display_text_ready'] === true || e['ready'] === true
    }
  })
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

