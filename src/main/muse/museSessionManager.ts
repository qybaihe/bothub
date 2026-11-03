import { BrowserWindow, session as electronSession } from 'electron'
import type { MuseMainEvent, MuseSessionStatus, WebViewBounds } from '@shared/ipc'
import { partitionForAccount, WebContentsViewManager } from '../webContentsViewManager'
import { MUSE_HOOK_SCRIPT, museDomSendScript, museRpcScript } from './hookScript'
import {
  MuseGatewayError,
  MuseNativeRegistry,
  museTransportMode,
  streamChat,
  unwrapMuseResult
} from '../muse-native'
import { fetchInviteSummary, fetchSubscription } from '../muse-native/quota'
import {
  runsFromResult,
  schedulesFromListResult,
  type MuseSchedule as NativeSchedule,
  type MuseTaskRun as NativeRun
} from '../muse-native/schedules'
import type { MuseQuotaSnapshot, MuseSchedule, MuseTaskRun } from '@shared/ipc'
import { applyMuseKeepAlive, MUSE_HEALTH_SCRIPT, museWakeScript } from './museKeepAlive'

const MUSE_ORIGIN = 'https://muse.ai'
const QUOTA_POLL_MS = 60_000
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
  /** Usage / quota snapshot (HTTPS Server Action). */
  quota?: MuseQuotaSnapshot
  quotaTimer?: ReturnType<typeof setInterval>
  /** Cancel handle for tasks.subscribe. */
  tasksSubCancel?: (reason?: string) => void
  schedules?: MuseSchedule[]
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
  /** Native Noise gateway clients (default transport; hook is the fallback). */
  private readonly native = new MuseNativeRegistry(partitionForAccount, (accountId, phase, error) =>
    this.onNativePhase(accountId, phase, error)
  )

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
      if (signedIn) {
        void this.refreshQuota(accountId)
        this.ensureQuotaPolling(accountId)
      } else if (session.quotaTimer) {
        clearInterval(session.quotaTimer)
        session.quotaTimer = undefined
      }
    } else if (signedIn && !session.quotaTimer) {
      void this.refreshQuota(accountId)
      this.ensureQuotaPolling(accountId)
    }

    session.status.url = view.webContents.getURL()

    if (signedIn) {
      try {
        await this.installHook(accountId)
        if (this.nativeReady(accountId)) {
          const pending = unwrapMuseResult(
            await this.native.get(accountId).gateway.request('egress.approvals', {})
          )
          const list = normalizeApprovals(pending)
          session.status.pendingApprovals = list.length
          this.emit({ type: 'approvals', accountId, pending: list })
        } else if (session.status.hook === 'sendRequest') {
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
    if (st.hook === 'sendRequest' || this.nativeReady(accountId)) {
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

  private onNativePhase(accountId: string, phase: string, error: string | null): void {
    const session = this.sessions.get(accountId)
    if (!session) return
    if (phase === 'ready') {
      session.status.ready = true
      session.status.phase = 'ready'
      session.status.phaseDetail = undefined
    } else if (error && /cvm|owner/i.test(error)) {
      session.status.phaseDetail = 'Muse needs Owner verification (CVM) — finish it in the web session'
    }
    this.emitStatus(accountId)
  }

  private nativeReady(accountId: string): boolean {
    return museTransportMode() === 'native' && Boolean(this.native.peek(accountId)?.gateway.isReady())
  }

  private async hasSessionCookie(accountId: string): Promise<boolean> {
    const ses = electronSession.fromPartition(partitionForAccount(accountId))
    return (await ses.cookies.get({ name: 'hatch_sess' })).length > 0
  }

  /** Native path; returns undefined when the caller should fall back to the hook. */
  private async rpcNative(
    accountId: string,
    method: string,
    params: unknown,
    conversationId?: string
  ): Promise<{ value: unknown } | undefined> {
    if (museTransportMode() !== 'native') return undefined
    if (!(await this.hasSessionCookie(accountId))) return undefined
    const client = this.native.get(accountId)
    try {
      await client.gateway.connect()
    } catch (error) {
      const cvm = error instanceof MuseGatewayError && error.code === 'cvm_required'
      console.warn('[muse] native connect failed; using hook', cvm ? 'cvm_required' : (error as Error).message)
      const session = this.sessions.get(accountId)
      if (cvm && session) {
        session.status.phaseDetail = 'Muse needs Owner verification (CVM) — finish it in the web session'
        this.emitStatus(accountId)
      }
      return undefined
    }
    if (method === 'chat.stream') {
      return { value: await this.nativeChatStream(accountId, params, conversationId) }
    }
    const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
    return { value: unwrapMuseResult(await client.gateway.request(method, p)) }
  }

  private async nativeChatStream(accountId: string, params: unknown, conversationId?: string): Promise<unknown> {
    const client = this.native.get(accountId)
    const text = extractChatText(params)
    const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
    const sessionId = typeof p['session_id'] === 'string' ? (p['session_id'] as string) : undefined
    const ids = new Map<string, string>()
    let last = ''
    let lastId = ''
    const result = await streamChat(
      client.gateway,
      client.chat,
      { text, nodeId: client.nodeId, sessionId },
      (u) => {
        let id = ids.get(u.messageId)
        if (!id) {
          id = `muse_native_${u.messageId}`
          ids.set(u.messageId, id)
        }
        last = u.text
        lastId = id
        if (conversationId) {
          this.emit({ type: 'stream', accountId, conversationId, messageId: id, text: u.text, done: u.done })
        }
      },
      { timeoutMs: 300_000 }
    )
    const reply = result.text || last
    return { ...result.ack, text: reply, display_text: reply, reply, assistant_message_id: lastId || undefined }
  }

  async rpc(
    accountId: string,
    method: string,
    params?: unknown,
    conversationId?: string
  ): Promise<unknown> {
    await this.ensure('muse', accountId)
    const viaNative = await this.rpcNative(accountId, method, params, conversationId)
    if (viaNative) return viaNative.value
    if (method === 'chat.stream') {
      // Legacy hook shape (page client fills the real device context).
      const legacy = { node_id: accountId, capabilities: {}, ...((params as Record<string, unknown>) ?? {}) }
      return this.chatStreamAndCollect(accountId, legacy, conversationId)
    }
    return this.rpcRaw(accountId, method, params)
  }

  /**
   * chat.stream is streamMode=subscription: the RPC ack is only
   * {message_id,session_id}. Poll chat.history for the assistant reply until
   * display_text_ready (or the text stops growing).
   */
  private async chatStreamAndCollect(
    accountId: string,
    params: unknown,
    conversationId?: string
  ): Promise<unknown> {
    const ack = (await this.rpcRaw(accountId, 'chat.stream', params)) as Record<string, unknown>

    // DOM fallback path already scraped page text.
    if (ack && ack['ok'] === true && ack['mode'] === 'dom') {
      const reply = typeof ack['reply'] === 'string' ? (ack['reply'] as string) : ''
      if (conversationId) {
        this.emit({
          type: 'stream',
          accountId,
          conversationId,
          messageId: `muse_dom_${Date.now().toString(36)}`,
          text: reply,
          done: true
        })
      }
      return { ...ack, text: reply, display_text: reply, reply }
    }

    const sessionId = typeof ack?.['session_id'] === 'string' ? (ack['session_id'] as string) : ''
    const messageId = typeof ack?.['message_id'] === 'string' ? (ack['message_id'] as string) : ''
    if (!sessionId || !messageId) {
      return ack
    }

    // Keep a stable BotHub-side id for progressive UI updates (do not switch to
    // muse message ids mid-stream — that would create duplicate bubbles).
    const streamMessageId = `muse_stream_${Date.now().toString(36)}`
    if (conversationId) {
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: streamMessageId,
        text: '',
        done: false
      })
    }

    const reply = await this.waitForAssistantReply(accountId, sessionId, messageId, 180_000, (info) => {
      if (!conversationId || !info.text) return
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: streamMessageId,
        text: info.text,
        done: false
      })
    })

    if (conversationId) {
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: streamMessageId,
        text: reply,
        done: true
      })
    }

    if (!reply) return ack
    return { ...ack, text: reply, display_text: reply, reply, assistant_message_id: streamMessageId }
  }

  private async waitForAssistantReply(
    accountId: string,
    sessionId: string,
    userMessageId: string,
    timeoutMs = 180_000,
    onProgress?: (info: { messageId: string; text: string }) => void
  ): Promise<string> {
    const started = Date.now()
    let userAt = 0
    let best = ''
    let bestId = ''
    let stableMs = 0
    let lastChangeAt = Date.now()
    const pollMs = 600

    while (Date.now() - started < timeoutMs) {
      let hist: unknown
      try {
        hist = await this.rpcRaw(accountId, 'chat.history', { session_id: sessionId, limit: 40 })
      } catch {
        await sleep(pollMs)
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
          (userAt ? e.occurredAt >= userAt : e.messageId !== userMessageId)
      )
      // Newest assistant after the user turn.
      assistants.sort((a, b) => b.occurredAt - a.occurredAt)
      const top = assistants[0]
      if (top) {
        if (top.text !== best) {
          best = top.text
          bestId = top.messageId
          lastChangeAt = Date.now()
          stableMs = 0
          onProgress?.({ messageId: bestId, text: best })
        } else {
          stableMs = Date.now() - lastChangeAt
        }
        // display_text_ready flips true on the FIRST paintable chunk — it does
        // NOT mean streaming finished. Wait for payload.status === completed.
        if (top.completed) return best
        // Safety net: text unchanged for a long time after we have content and
        // updatedAt also stopped moving (history often jumps once at the end).
        if (best.length > 0 && stableMs >= 45_000) return best
      }
      await sleep(pollMs)
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
    try {
      const result = await this.rpc(
        accountId,
        'chat.stream',
        // node_id / capabilities are filled per transport (native: device id + delta_stream).
        { items: [{ type: 'text', text }] },
        conversationId
      )
      const reply = extractReplyText(result)
      const resultObj = result && typeof result === 'object' ? (result as Record<string, unknown>) : null
      const fromResult =
        resultObj && typeof resultObj['assistant_message_id'] === 'string'
          ? (resultObj['assistant_message_id'] as string)
          : ''
      const messageId = fromResult || `muse_${Date.now().toString(36)}`
      if (!reply) {
        this.emit({
          type: 'stream',
          accountId,
          conversationId,
          messageId,
          text: '(Muse accepted the message; open the web session if the reply is only visible there.)',
          done: true
        })
      }
      return { messageId }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const messageId = `muse_${Date.now().toString(36)}`
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
    this.native.dispose(accountId)
    const session = this.sessions.get(accountId)
    if (!session) return
    if (session.pollTimer) clearInterval(session.pollTimer)
    if (session.quotaTimer) clearInterval(session.quotaTimer)
    try {
      session.tasksSubCancel?.('dispose')
    } catch {
      /* ignore */
    }
    this.views.destroy(session.viewId)
    this.sessions.delete(accountId)
  }

  private partitionFetch(accountId: string) {
    const ses = electronSession.fromPartition(partitionForAccount(accountId))
    return (url: string, init?: RequestInit) => ses.fetch(url, init)
  }

  getQuota(accountId: string): MuseQuotaSnapshot | null {
    return this.sessions.get(accountId)?.quota ?? null
  }

  async refreshQuota(accountId: string): Promise<MuseQuotaSnapshot> {
    const session = this.sessions.get(accountId)
    const prev = session?.quota
    try {
      if (!(await this.hasSessionCookie(accountId))) {
        const snap: MuseQuotaSnapshot = {
          fetchedAt: Date.now(),
          stale: Boolean(prev),
          success: false,
          subscription: prev?.subscription ?? null,
          error: 'Sign in to muse.ai first'
        }
        if (session) session.quota = snap
        this.emit({ type: 'quota', accountId, snapshot: snap })
        return snap
      }
      const native = await fetchSubscription(this.partitionFetch(accountId), { includeAgreement: false })
      const invite = await fetchInviteSummary(this.partitionFetch(accountId))
      const snap: MuseQuotaSnapshot = {
        fetchedAt: native.fetchedAt,
        stale: false,
        success: native.success,
        subscription: native.subscription,
        inviteUsesRemaining: invite?.usesRemaining ?? null
      }
      if (session) {
        session.quota = snap
        this.ensureQuotaPolling(accountId)
      }
      this.emit({ type: 'quota', accountId, snapshot: snap })
      return snap
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const snap: MuseQuotaSnapshot = {
        fetchedAt: Date.now(),
        stale: true,
        success: false,
        subscription: prev?.subscription ?? null,
        error: msg.slice(0, 200)
      }
      if (session) session.quota = snap
      this.emit({ type: 'quota', accountId, snapshot: snap })
      return snap
    }
  }

  private ensureQuotaPolling(accountId: string): void {
    const session = this.sessions.get(accountId)
    if (!session || session.quotaTimer) return
    session.quotaTimer = setInterval(() => {
      void this.refreshQuota(accountId)
    }, QUOTA_POLL_MS)
  }

  async listSchedules(accountId: string): Promise<MuseSchedule[]> {
    const native = await this.rpcNative(accountId, 'tasks.list', {})
    const raw = native ? native.value : await this.rpc(accountId, 'tasks.list', {})
    const list = schedulesFromListResult(raw).map(toSharedSchedule)
    const session = this.sessions.get(accountId)
    if (session) session.schedules = list
    this.emit({ type: 'schedules', accountId, schedules: list })
    void this.ensureTasksSubscribe(accountId)
    return list
  }

  async listScheduleRuns(accountId: string, jobId?: string): Promise<MuseTaskRun[]> {
    const params: Record<string, unknown> = {}
    if (jobId) params['job_id'] = jobId
    const native = await this.rpcNative(accountId, 'tasks.runs', params)
    const raw = native ? native.value : await this.rpc(accountId, 'tasks.runs', params)
    return runsFromResult(raw).map(toSharedRun)
  }

  async runSchedule(accountId: string, jobId: string): Promise<unknown> {
    const params = { job_id: jobId }
    const native = await this.rpcNative(accountId, 'tasks.run', params)
    const raw = native ? native.value : await this.rpc(accountId, 'tasks.run', params)
    void this.listSchedules(accountId)
    return raw
  }

  async deleteSchedule(accountId: string, jobId: string): Promise<unknown> {
    const params = { job_id: jobId }
    const native = await this.rpcNative(accountId, 'tasks.delete', params)
    const raw = native ? native.value : await this.rpc(accountId, 'tasks.delete', params)
    void this.listSchedules(accountId)
    return raw
  }

  private async ensureTasksSubscribe(accountId: string): Promise<void> {
    if (!this.nativeReady(accountId)) return
    const session = this.sessions.get(accountId)
    if (!session || session.tasksSubCancel) return
    try {
      const client = this.native.get(accountId)
      const handle = await client.gateway.subscribe('tasks.subscribe', {}, () => {
        void this.listSchedules(accountId)
      })
      session.tasksSubCancel = handle.cancel
      void handle.ack.catch(() => undefined)
      void handle.done.then(
        () => {
          if (session.tasksSubCancel === handle.cancel) session.tasksSubCancel = undefined
        },
        () => {
          if (session.tasksSubCancel === handle.cancel) session.tasksSubCancel = undefined
        }
      )
    } catch (error) {
      console.warn('[muse] tasks.subscribe failed', error instanceof Error ? error.message : error)
    }
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
      void this.refreshSession(accountId).then((status) => {
        // Tell the renderer the window went away without a session, so a
        // waiting add-bot flow can offer to reopen it.
        if (!status?.signedIn) this.emit({ type: 'login', accountId, signedIn: false, windowClosed: true })
      })
    })

    try {
      await win.loadURL(MUSE_ORIGIN)
    } catch (error) {
      console.error('[muse] openLogin load failed', error)
    }
    return this.sessions.get(accountId)!.status
  }

  /**
   * Abandon an unfinished login: close its window (if open), tear down the
   * view and wipe the partition so no orphaned session stays on disk.
   */
  async cancelLogin(accountId: string): Promise<void> {
    const win = this.loginWindows.get(accountId)
    this.loginWindows.delete(accountId)
    if (win && !win.isDestroyed()) win.destroy()
    this.destroyAccount(accountId)
    await this.views.clearPartition(accountId)
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
  /** True once muse marks the assistant turn finished (payload.status). */
  completed: boolean
  updatedAt: number
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
    const payload = (e['payload'] as Record<string, unknown> | undefined) ?? undefined
    const status = String(payload?.['status'] ?? e['status'] ?? '').toLowerCase()
    return {
      messageId: String(e['message_id'] ?? e['id'] ?? ''),
      eventName: String(e['event_name'] ?? e['type'] ?? ''),
      text: String(e['display_text'] ?? e['text'] ?? e['content'] ?? ''),
      occurredAt: Number(e['occurred_at_ms'] ?? e['created_at_ms'] ?? 0) || 0,
      completed: status === 'completed' || status === 'done' || status === 'finished',
      updatedAt: Number(e['display_text_updated_at_ms'] ?? e['updated_at_ms'] ?? 0) || 0
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

function toSharedSchedule(s: NativeSchedule): MuseSchedule {
  return {
    id: s.id,
    title: s.title,
    scheduleKey: s.scheduleKey,
    timezone: s.timezone,
    isHeartbeat: s.isHeartbeat,
    mode: s.mode,
    enabled: s.enabled,
    nextRunAtUtc: s.nextRunAtUtc,
    cadenceLabel: s.cadenceLabel
  }
}

function toSharedRun(r: NativeRun): MuseTaskRun {
  return {
    id: r.id,
    jobId: r.jobId,
    status: r.status,
    startedAtUtc: r.startedAtUtc,
    finishedAtUtc: r.finishedAtUtc,
    title: r.title
  }
}
