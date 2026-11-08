import { BrowserWindow, Notification, session as electronSession } from 'electron'
import type { MuseMainEvent, MuseSessionStatus, WebViewBounds } from '@shared/ipc'
import { partitionForAccount, WebContentsViewManager } from '../webContentsViewManager'
import { MUSE_HOOK_SCRIPT, museDomSendScript, museRpcScript } from './hookScript'
import {
  MuseGatewayError,
  MuseNativeRegistry,
  museTransportMode,
  streamChat,
  selectOptionWidget,
  parseAgentStatus,
  parseOptionWidgets,
  parseRichWidgets,
  parseMediaParts,
  parseHistoryTranscript,
  transcriptText,
  unwrapMuseResult,
  type MuseChatEvent,
  type MuseOptionWidget
} from '../muse-native'
import { fetchFsRawPreview, uploadWorkspaceFile, buildWorkspaceUploadPath } from '../muse-native/fs'
import { createProxyAgent } from './accountProxy'
import { fetchInviteSummary, fetchSubscription } from '../muse-native/quota'
import {
  fetchInvite,
  redeemInviteCode,
  type MuseInviteSnapshot as NativeInvite
} from '../muse-native/invite'
import {
  runsFromResult,
  schedulesFromListResult,
  type MuseSchedule as NativeSchedule,
  type MuseTaskRun as NativeRun
} from '../muse-native/schedules'
import { sessionsFromListResult, sessionIdParams } from '../muse-native/sessions'
import { artifactsFromListResult, libraryFromResult } from '../muse-native/files'
import type {
  MuseChatSessionView,
  MuseConnectorConnectResult,
  MuseConnectorView,
  MuseFileEntryView,
  MuseHistoryMessageView,
  MuseInviteSnapshot,
  MuseQuotaSnapshot,
  MuseSchedule,
  MuseSessionMutation,
  MuseTaskRun
} from '@shared/ipc'
import { driveEmailOtpLogin } from './museAutoLogin'
import type { MuseAutoLoginRequest, MuseAutoLoginResult } from '@shared/museBatch'
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
  /** Cancel handles for fs.subscribe / artifacts.subscribe. */
  filesSubCancel?: (reason?: string) => void
  artifactsSubCancel?: (reason?: string) => void
  schedules?: MuseSchedule[]
  invite?: MuseInviteSnapshot
  chatSessions?: MuseChatSessionView[]
  files?: MuseFileEntryView[]
  connectors?: MuseConnectorView[]
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
  /** Running batch auto-logins keyed by accountId. */
  private readonly autoLogins = new Map<string, AbortController>()
  /** Interactive login windows keyed by accountId (same persist partition). */
  private readonly loginWindows = new Map<string, BrowserWindow>()
  /** Native Noise gateway clients (default transport; hook is the fallback). */
  private readonly native = new MuseNativeRegistry(partitionForAccount, (accountId, phase, error) =>
    this.onNativePhase(accountId, phase, error)
  )
  /** Accounts with a lifetime chat.subscribe activity/widget watcher. */
  private readonly chatWatchBound = new Set<string>()
  /** Accounts currently inside an active streamChat turn (watch listener defers to streamChat). */
  private readonly activeStreams = new Map<string, AbortController>()
  /** Spontaneous delta.text_append accumulator keyed by `${accountId}:${messageId}`. */
  private readonly watchTexts = new Map<string, string>()

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
    if (!session) return undefined

    const partition = partitionForAccount(accountId)
    const ses = electronSession.fromPartition(partition)
    const cookies = await ses.cookies.get({ name: 'hatch_sess' })
    // hatch_sess is the source of truth. The embedded WebContentsView often still
    // sits on Meta/Facebook auth from the pre-login redirect; that URL must not
    // veto a cookie that the login window just wrote into the shared partition.
    const signedIn = cookies.length > 0

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

    if (view && !view.webContents.isDestroyed()) {
      session.status.url = view.webContents.getURL()
    }

    if (signedIn && view && !view.webContents.isDestroyed()) {
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
      this.ensureChatWatch(accountId)
    } else if (error && /cvm|owner/i.test(error)) {
      session.status.phaseDetail = 'Muse needs Owner verification (CVM) — finish it in the web session'
    }
    this.emitStatus(accountId)
  }


  /** Desktop toast when the main window is blurred (approvals / new reply). Never auto-approves. */
  private maybeNotify(title: string, body: string): void {
    try {
      if (this.window.isDestroyed() || this.window.isFocused()) return
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body: body.slice(0, 180), silent: false })
      n.on('click', () => {
        if (!this.window.isDestroyed()) {
          this.window.show()
          this.window.focus()
        }
      })
      n.show()
    } catch (error) {
      console.warn('[muse] notify', error instanceof Error ? error.message : error)
    }
  }

  /** Pull Sentinel approvals and emit (official: query on needs_approval / 5s stale). */
  async refreshApprovals(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId)
    if (!session) return
    try {
      let pending: ReturnType<typeof normalizeApprovals> = []
      if (this.nativeReady(accountId)) {
        pending = normalizeApprovals(
          unwrapMuseResult(await this.native.get(accountId).gateway.request('egress.approvals', {}))
        )
      } else if (session.status.hook === 'sendRequest') {
        pending = normalizeApprovals(await this.rpcRaw(accountId, 'egress.approvals', {}))
      } else {
        return
      }
      const prevCount = session.status.pendingApprovals
      session.status.pendingApprovals = pending.length
      this.emit({ type: 'approvals', accountId, pending })
      this.emitStatus(accountId)
      if (pending.length > 0 && pending.length >= prevCount) {
        const first = pending[0] as { host?: string; title?: string; detail?: string }
        const label = first?.host || first?.title || '权限请求'
        this.maybeNotify('Muse 需要确认', String(first?.detail || label))
      }
    } catch (error) {
      console.warn('[muse] refreshApprovals', error instanceof Error ? error.message : error)
    }
  }

  /** Keep chat.subscribe open for agent.status + spontaneous onboarding bubbles. */
  private ensureChatWatch(accountId: string): void {
    if (this.chatWatchBound.has(accountId)) return
    const session = this.sessions.get(accountId)
    if (!session) return
    const client = this.native.get(accountId)
    this.chatWatchBound.add(accountId)
    void client.chat.ensure().then(() => {
      client.chat.on('event', (e: MuseChatEvent) => this.onChatWatchEvent(accountId, e))
    }).catch(() => {
      this.chatWatchBound.delete(accountId)
    })
  }

  private onChatWatchEvent(accountId: string, e: MuseChatEvent): void {
    const session = this.sessions.get(accountId)
    if (!session) return
    const p = e.payload
    if (e.name === 'agent.status') {
      const act = parseAgentStatus(p)
      this.emit({
        type: 'activity',
        accountId,
        activityCode: act.code,
        activityText: act.text ?? undefined,
        activityEmoji: act.emoji ?? undefined,
        agentId: act.agentId ?? undefined,
        subagents: act.subagents,
        busy: act.busy,
        ctaLabel: act.cta?.label
      })
      // Official client has no approvals.subscribe — needs_approval triggers refetch.
      if (act.code === 'needs_approval') {
        void this.refreshApprovals(accountId)
      }
      return
    }
    // Spontaneous assistant / presentation (e.g. onboarding) when not driven by streamChat UI:
    // only emit when we have a botId conversation and the event carries a message id.
    if (this.activeStreams.has(accountId)) return
    const conversationId = session.botId
    if (!conversationId) return
    const id = typeof p['message_id'] === 'string' ? (p['message_id'] as string) : ''
    if (!id) return
    const watched =
      e.name === 'message.assistant' ||
      e.name === 'delta.message_start' ||
      e.name === 'delta.text_append' ||
      e.name === 'delta.message_done' ||
      e.name === 'delta.presentation' ||
      e.name === 'delta.placeholder'
    if (!watched) return
    const widgets = parseOptionWidgets(p)
    const richWidgets = parseRichWidgets(p)
    const media = parseMediaParts(p)
    const watchKey = `${accountId}:${id}`
    const display =
      transcriptText(p) ||
      (typeof p['display_text'] === 'string' && p['display_text']) ||
      (typeof p['content'] === 'string' && p['content']) ||
      ''
    if (e.name === 'delta.message_start' || e.name === 'delta.placeholder') {
      const placeholder = e.name === 'delta.placeholder' ? String(p['text'] ?? p['placeholder'] ?? '') : ''
      this.watchTexts.set(watchKey, placeholder)
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: `muse_native_${id}`,
        text: placeholder,
        done: false,
        widgets: widgets.length ? widgets : undefined,
        richWidgets: richWidgets.length ? richWidgets : undefined,
        media: media.length ? media : undefined
      })
      return
    }
    if (e.name === 'delta.text_append') {
      const chunk = typeof p['text'] === 'string' ? (p['text'] as string) : ''
      if (!chunk) return
      const next = (this.watchTexts.get(watchKey) ?? '') + chunk
      this.watchTexts.set(watchKey, next)
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: `muse_native_${id}`,
        text: next,
        done: false,
        widgets: widgets.length ? widgets : undefined,
        richWidgets: richWidgets.length ? richWidgets : undefined,
        media: media.length ? media : undefined
      })
      return
    }
    if (e.name === 'delta.presentation' || e.name === 'message.assistant' || e.name === 'delta.message_done') {
      const body = display || this.watchTexts.get(watchKey) || ''
      const isDone = e.name === 'message.assistant' || e.name === 'delta.message_done'
      if (isDone) this.watchTexts.delete(watchKey)
      if (!body && !widgets.length && !richWidgets.length && !media.length) return
      this.emit({
        type: 'stream',
        accountId,
        conversationId,
        messageId: `muse_native_${id}`,
        text: body,
        done: isDone,
        widgets: widgets.length ? widgets : undefined,
        richWidgets: richWidgets.length ? richWidgets : undefined,
        media: media.length ? media : undefined
      })
    }
  }

  private mapStreamWidgets(list: MuseOptionWidget[] | undefined): MuseOptionWidget[] | undefined {
    return list && list.length ? list : undefined
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
    this.ensureChatWatch(accountId)
    const client = this.native.get(accountId)
    const text = extractChatText(params)
    const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
    const sessionId = typeof p['session_id'] === 'string' ? (p['session_id'] as string) : undefined
    const messageOrigin =
      p['message_origin'] && typeof p['message_origin'] === 'object'
        ? (p['message_origin'] as Record<string, unknown>)
        : undefined
    const ids = new Map<string, string>()
    let last = ''
    let lastId = ''
    this.activeStreams.get(accountId)?.abort()
    const ctrl = new AbortController()
    this.activeStreams.set(accountId, ctrl)
    try {
      const result = await streamChat(
        client.gateway,
        client.chat,
        { text, nodeId: client.nodeId, sessionId, messageOrigin, items: extractChatItems(params) },
        (u) => {
          let id = ids.get(u.messageId)
          if (!id) {
            id = `muse_native_${u.messageId}`
            ids.set(u.messageId, id)
          }
          last = u.text
          lastId = id
          if (conversationId) {
            this.emit({
              type: 'stream',
              accountId,
              conversationId,
              messageId: id,
              text: u.text,
              done: u.done,
              widgets: this.mapStreamWidgets(u.widgets),
              richWidgets: u.richWidgets,
              tools: u.tools,
              media: u.media
            })
            if (u.done && u.text.trim()) {
              this.maybeNotify('Muse', u.text.trim().slice(0, 120))
            }
          }
        },
        { timeoutMs: 600_000, settleMs: 1500, signal: ctrl.signal }
      )
      const reply = result.text || last
      return {
        ...result.ack,
        session_id: result.sessionId ?? result.ack['session_id'],
        text: reply,
        display_text: reply,
        reply,
        assistant_message_id: lastId || undefined
      }
    } finally {
      if (this.activeStreams.get(accountId) === ctrl) this.activeStreams.delete(accountId)
    }
  }

  async selectOption(
    accountId: string,
    args: {
      conversationId: string
      hostMessageId: string
      widget: MuseOptionWidget
      selectedText: string
      optionIndex: number
      sessionId?: string
    }
  ): Promise<unknown> {
    this.ensureChatWatch(accountId)
    const client = this.native.get(accountId)
    const hostId = args.hostMessageId.replace(/^muse_native_/, '')
    const ids = new Map<string, string>()
    let last = ''
    let lastId = ''
    const result = await selectOptionWidget(
      client.gateway,
      client.chat,
      {
        nodeId: client.nodeId,
        sessionId: args.sessionId,
        hostMessageId: hostId,
        widget: args.widget,
        selectedText: args.selectedText,
        optionIndex: args.optionIndex
      },
      (u) => {
        let id = ids.get(u.messageId)
        if (!id) {
          id = `muse_native_${u.messageId}`
          ids.set(u.messageId, id)
        }
        last = u.text
        lastId = id
        this.emit({
          type: 'stream',
          accountId,
          conversationId: args.conversationId,
          messageId: id,
          text: u.text,
          done: u.done,
          widgets: this.mapStreamWidgets(u.widgets),
          richWidgets: u.richWidgets,
          tools: u.tools,
          media: u.media
        })
      },
      { timeoutMs: 600_000, settleMs: 1500 }
    )
    const reply = result.text || last
    return { ...result.ack, text: reply, display_text: reply, reply, assistant_message_id: lastId || undefined }
  }


  /** Preview a workspace file via fs.raw (binary). Caps ~8MiB for UI. */
  async previewWorkspaceFile(
    accountId: string,
    path: string
  ): Promise<{ path: string; mimeType: string; dataBase64: string; byteLength: number }> {
    await this.ensure('muse', accountId)
    const client = this.native.get(accountId)
    if (!client) throw new Error('Muse native client not ready')
    return fetchFsRawPreview(client.gateway, path)
  }

  /**
   * Eager-upload bytes to workspace/user/files/… via chunked fs.write
   * (official HatchGatewayFs / HatchAttachments file_ref path).
   */
  async uploadWorkspaceFile(
    accountId: string,
    args: { filename: string; mimeType: string; dataBase64: string }
  ): Promise<{ path: string; filename: string; mimeType: string }> {
    await this.ensure('muse', accountId)
    const client = this.native.get(accountId)
    if (!client) throw new Error('Muse native client not ready')
    const bytes = Buffer.from(args.dataBase64, 'base64')
    const path = buildWorkspaceUploadPath(args.filename || 'file')
    const uploaded = await uploadWorkspaceFile(client.gateway, path, new Uint8Array(bytes), {
      stageBeforePublish: true
    })
    return { path: uploaded, filename: args.filename || 'file', mimeType: args.mimeType || 'application/octet-stream' }
  }

  /** Re-apply stored proxy to live Noise client (session.setProxy already applied in save). */
  async applyAccountProxy(accountId: string): Promise<void> {
    const client = this.native.peek(accountId)
    if (!client) return
    const agent = await createProxyAgent(accountId)
    client.gateway.setProxyAgent(agent)
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
      session.filesSubCancel?.('dispose')
      session.artifactsSubCancel?.('dispose')
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



  getInvite(accountId: string): MuseInviteSnapshot | null {
    return this.sessions.get(accountId)?.invite ?? null
  }

  async refreshInvite(accountId: string): Promise<MuseInviteSnapshot> {
    const session = this.sessions.get(accountId)
    try {
      if (!(await this.hasSessionCookie(accountId))) {
        const snap: MuseInviteSnapshot = {
          fetchedAt: Date.now(),
          inviteState: 'SIGNED_OUT',
          title: null,
          subtitle: null,
          code: null,
          inviteLink: null,
          shareText: null,
          maxUses: null,
          useCount: null,
          usesRemaining: null,
          hasRedeemedInviteCode: false,
          inviteCodeEntryAvailable: false,
          reward: null,
          redeemSubtitle: null,
          redeemDisclaimer: null,
          error: 'Sign in to muse.ai first'
        }
        if (session) session.invite = snap
        this.emit({ type: 'invite', accountId, snapshot: snap })
        return snap
      }
      const native = await fetchInvite(this.partitionFetch(accountId))
      const snap = toSharedInvite(native)
      if (session) session.invite = snap
      this.emit({ type: 'invite', accountId, snapshot: snap })
      return snap
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const prev = session?.invite
      const snap: MuseInviteSnapshot = {
        fetchedAt: Date.now(),
        inviteState: prev?.inviteState ?? 'ERROR',
        title: prev?.title ?? null,
        subtitle: prev?.subtitle ?? null,
        code: prev?.code ?? null,
        inviteLink: prev?.inviteLink ?? null,
        shareText: prev?.shareText ?? null,
        maxUses: prev?.maxUses ?? null,
        useCount: prev?.useCount ?? null,
        usesRemaining: prev?.usesRemaining ?? null,
        hasRedeemedInviteCode: prev?.hasRedeemedInviteCode ?? false,
        inviteCodeEntryAvailable: prev?.inviteCodeEntryAvailable ?? false,
        reward: prev?.reward ?? null,
        redeemSubtitle: prev?.redeemSubtitle ?? null,
        redeemDisclaimer: prev?.redeemDisclaimer ?? null,
        error: msg.slice(0, 200)
      }
      if (session) session.invite = snap
      this.emit({ type: 'invite', accountId, snapshot: snap })
      return snap
    }
  }

  async redeemInvite(
    accountId: string,
    code: string
  ): Promise<{ ok: boolean; message: string; openSettings?: boolean }> {
    if (!(await this.hasSessionCookie(accountId))) {
      return { ok: false, message: 'Sign in to muse.ai first' }
    }
    const result = await redeemInviteCode(this.partitionFetch(accountId), code)
    if (result.ok) void this.refreshInvite(accountId)
    return result
  }

  async listSessions(accountId: string): Promise<MuseChatSessionView[]> {
    const native = await this.rpcNative(accountId, 'sessions.list', {})
    const raw = native ? native.value : await this.rpc(accountId, 'sessions.list', {})
    const list = sessionsFromListResult(raw)
    const session = this.sessions.get(accountId)
    if (session) session.chatSessions = list
    this.emit({ type: 'sessions', accountId, sessions: list })
    return list
  }

  async mutateSession(accountId: string, mutation: MuseSessionMutation): Promise<unknown> {
    const params = sessionIdParams(mutation.sessionId)
    let method = ''
    if (mutation.op === 'archive') method = 'session.archive'
    else if (mutation.op === 'unarchive') method = 'session.unarchive'
    else if (mutation.op === 'pin') method = 'session.pin'
    else if (mutation.op === 'unpin') method = 'session.unpin'
    else if (mutation.op === 'delete') method = 'session.delete'
    else if (mutation.op === 'rename') {
      method = 'session.rename'
      params['title'] = mutation.title
      params['name'] = mutation.title
    } else {
      throw new TypeError('Unknown session mutation')
    }
    const native = await this.rpcNative(accountId, method, params)
    const raw = native ? native.value : await this.rpc(accountId, method, params)
    void this.listSessions(accountId)
    return raw
  }

  async cancelChat(accountId: string, sessionId?: string): Promise<{ ok: true }> {
    this.activeStreams.get(accountId)?.abort()
    this.activeStreams.delete(accountId)
    try {
      const params: Record<string, unknown> = {}
      if (sessionId) params['session_id'] = sessionId
      const native = await this.rpcNative(accountId, 'chat.cancel', params)
      if (!native) await this.rpc(accountId, 'chat.cancel', params)
    } catch {
      /* best effort */
    }
    return { ok: true }
  }

  async startSession(accountId: string): Promise<{ sessionId: string | null }> {
    const native = await this.rpcNative(accountId, 'session.start', {})
    const raw = native ? native.value : await this.rpc(accountId, 'session.start', {})
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const nested = o['session'] && typeof o['session'] === 'object' ? (o['session'] as Record<string, unknown>) : o
    const sessionId =
      typeof nested['session_id'] === 'string'
        ? (nested['session_id'] as string)
        : typeof nested['id'] === 'string'
          ? (nested['id'] as string)
          : null
    void this.listSessions(accountId)
    return { sessionId }
  }

  async loadSessionHistory(accountId: string, sessionId: string): Promise<MuseHistoryMessageView[]> {
    const params = { session_id: sessionId, limit: 100 }
    const native = await this.rpcNative(accountId, 'chat.history', params)
    const raw = native ? native.value : await this.rpc(accountId, 'chat.history', params)
    const rows = parseHistoryTranscript(raw)
    try {
      void this.rpcNative(accountId, 'chat.mark_seen', { thread_id: sessionId, session_id: sessionId }).catch(() => undefined)
    } catch {
      /* ignore */
    }
    return rows
  }

  async listFiles(accountId: string): Promise<MuseFileEntryView[]> {
    const out: MuseFileEntryView[] = []
    try {
      const native = await this.rpcNative(accountId, 'artifacts.list', {})
      const raw = native ? native.value : await this.rpc(accountId, 'artifacts.list', {})
      out.push(...artifactsFromListResult(raw))
    } catch (error) {
      console.warn('[muse] artifacts.list', error instanceof Error ? error.message : error)
    }
    try {
      const native = await this.rpcNative(accountId, 'fs.library', {})
      const raw = native ? native.value : await this.rpc(accountId, 'fs.library', {})
      out.push(...libraryFromResult(raw))
    } catch (error) {
      console.warn('[muse] fs.library', error instanceof Error ? error.message : error)
    }
    // Dedupe by id
    const seen = new Set<string>()
    const unique = out.filter((f) => {
      if (seen.has(f.id)) return false
      seen.add(f.id)
      return true
    })
    const session = this.sessions.get(accountId)
    if (session) session.files = unique
    this.emit({ type: 'files', accountId, files: unique })
    void this.ensureFilesSubscribe(accountId)
    return unique
  }

  private async ensureFilesSubscribe(accountId: string): Promise<void> {
    if (!this.nativeReady(accountId)) return
    const session = this.sessions.get(accountId)
    if (!session) return
    const client = this.native.get(accountId)
    if (!session.filesSubCancel) {
      try {
        const h = await client.gateway.subscribe('fs.subscribe', {}, () => {
          void this.listFiles(accountId)
        })
        session.filesSubCancel = h.cancel
        void h.ack.catch(() => undefined)
        void h.done.then(
          () => {
            if (session.filesSubCancel === h.cancel) session.filesSubCancel = undefined
          },
          () => {
            if (session.filesSubCancel === h.cancel) session.filesSubCancel = undefined
          }
        )
      } catch {
        /* ignore */
      }
    }
    if (!session.artifactsSubCancel) {
      try {
        const h = await client.gateway.subscribe('artifacts.subscribe', {}, () => {
          void this.listFiles(accountId)
        })
        session.artifactsSubCancel = h.cancel
        void h.ack.catch(() => undefined)
        void h.done.then(
          () => {
            if (session.artifactsSubCancel === h.cancel) session.artifactsSubCancel = undefined
          },
          () => {
            if (session.artifactsSubCancel === h.cancel) session.artifactsSubCancel = undefined
          }
        )
      } catch {
        /* ignore */
      }
    }
  }

  async listConnectors(accountId: string): Promise<MuseConnectorView[]> {
    const native = await this.rpcNative(accountId, 'connectors.list', {})
    const raw = native ? native.value : await this.rpc(accountId, 'connectors.list', {})
    const list = mapConnectors(raw)
    const session = this.sessions.get(accountId)
    if (session) session.connectors = list
    this.emit({ type: 'connectors', accountId, connectors: list })
    return list
  }

  async connectConnector(accountId: string, connectorId: string): Promise<MuseConnectorConnectResult> {
    try {
      const infoNative = await this.rpcNative(accountId, 'connectors.connect_info', { id: connectorId })
      const infoRaw = infoNative ? infoNative.value : await this.rpc(accountId, 'connectors.connect_info', { id: connectorId })
      const oauthUrl = extractOauthUrl(infoRaw)
      if (oauthUrl) {
        return { ok: true, oauthUrl, message: 'Finish connecting in your browser' }
      }
      const native = await this.rpcNative(accountId, 'connectors.connect', { id: connectorId })
      if (!native) await this.rpc(accountId, 'connectors.connect', { id: connectorId })
      void this.listConnectors(accountId)
      return { ok: true, message: 'Connected' }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { ok: false, message: msg.slice(0, 200) }
    }
  }

  async disconnectConnector(
    accountId: string,
    connectorId: string
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const native = await this.rpcNative(accountId, 'connectors.disconnect', { id: connectorId })
      if (!native) await this.rpc(accountId, 'connectors.disconnect', { id: connectorId })
      void this.listConnectors(accountId)
      return { ok: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { ok: false, message: msg.slice(0, 200) }
    }
  }

  /**
   * Open a dedicated BrowserWindow that shares the account's persist partition
   * and loads muse.ai. Meta/Facebook auth redirects stay in-window. When the
   * `hatch_sess` cookie appears, emit login, reload the embedded view, and close.
   */
  async openLogin(botId: string, accountId: string, opts?: { hidden?: boolean }): Promise<MuseSessionStatus> {
    await this.ensure(botId, accountId)
    const refreshed = await this.refreshSession(accountId)
    if (refreshed?.signedIn) return refreshed

    const existing = this.loginWindows.get(accountId)
    if (existing && !existing.isDestroyed()) {
      if (!opts?.hidden) {
        existing.show()
        existing.focus()
      }
      return this.sessions.get(accountId)!.status
    }

    const partition = partitionForAccount(accountId)
    const win = new BrowserWindow({
      width: 1040,
      height: 780,
      minWidth: 720,
      minHeight: 560,
      title: '使用 Muse 登录',
      show: !opts?.hidden,
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
      if (cookies.length === 0) return

      // hatch_sess is the source of truth — do not wait for the IdP URL to change.
      // Emit signed-in BEFORE reloading the embedded view or closing the window:
      // loading muse.ai (or Meta clearing an intermediate cookie) must not race
      // ahead of the add-bot UI advancing to the Name step.
      settling = true
      const sess = this.sessions.get(accountId)
      if (sess) {
        sess.status.signedIn = true
        sess.status.phase = 'connecting'
      }
      this.emit({ type: 'login', accountId, signedIn: true })

      try {
        if (!win.isDestroyed()) win.close()
      } catch {
        /* ignore */
      }

      const session = this.sessions.get(accountId)
      const view = session && this.views.getView(session.viewId)
      if (view && !view.webContents.isDestroyed()) {
        try {
          await view.webContents.loadURL(MUSE_ORIGIN)
        } catch (error) {
          console.error('[muse] reload embedded view after login failed', error)
        }
      }
      try {
        await this.refreshSession(accountId)
      } catch (error) {
        console.error('[muse] refreshSession after login failed', error)
      }
      // Keep the optimistic signed-in flag if muse briefly drops the cookie mid-reload.
      const still = this.sessions.get(accountId)
      if (still && !(await this.hasSessionCookie(accountId))) {
        still.status.signedIn = true
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
      void (async () => {
        // finishIfSignedIn already advanced the add-bot flow.
        if (settling || this.sessions.get(accountId)?.status.signedIn) {
          this.emit({ type: 'login', accountId, signedIn: true })
          return
        }
        const status = await this.refreshSession(accountId)
        if (status?.signedIn) {
          this.emit({ type: 'login', accountId, signedIn: true })
          return
        }
        if (await this.hasSessionCookie(accountId)) {
          const session = this.sessions.get(accountId)
          if (session) {
            session.status.signedIn = true
            session.status.phase = 'connecting'
            this.emit({ type: 'login', accountId, signedIn: true })
            this.emitStatus(accountId)
          }
          return
        }
        // Window went away without a session — offer reopen in add-bot UI.
        this.emit({ type: 'login', accountId, signedIn: false, windowClosed: true })
      })()
    })

    const poll = setInterval(() => {
      if (win.isDestroyed() || settling) {
        clearInterval(poll)
        return
      }
      void finishIfSignedIn()
    }, 1000)
    win.on('closed', () => clearInterval(poll))

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
  /** Batch import: email one-time-code login driven inside a hidden login window. */
  async autoLogin(req: MuseAutoLoginRequest): Promise<MuseAutoLoginResult> {
    this.autoLogins.get(req.accountId)?.abort()
    const ctrl = new AbortController()
    this.autoLogins.set(req.accountId, ctrl)
    try {
      const status = await this.openLogin(req.botId, req.accountId, { hidden: true })
      if (status.signedIn) return { ok: true }
      const win = this.loginWindows.get(req.accountId)
      if (!win || win.isDestroyed()) {
        return (await this.hasSessionCookie(req.accountId)) ? { ok: true } : { ok: false, reason: 'timeout' }
      }
      const result = await driveEmailOtpLogin(win, req, {
        signal: ctrl.signal,
        isSignedIn: async () =>
          Boolean(this.sessions.get(req.accountId)?.status.signedIn) || (await this.hasSessionCookie(req.accountId))
      })
      if (!result.ok) console.warn('[muse] auto login did not finish:', result.reason)
      return result
    } catch (error) {
      console.warn('[muse] auto login failed:', error instanceof Error ? error.name : 'error')
      return { ok: false, reason: 'timeout' }
    } finally {
      if (this.autoLogins.get(req.accountId) === ctrl) this.autoLogins.delete(req.accountId)
    }
  }

  showLogin(accountId: string): boolean {
    const win = this.loginWindows.get(accountId)
    if (!win || win.isDestroyed()) return false
    win.show()
    win.focus()
    return true
  }

  async cancelLogin(accountId: string): Promise<void> {
    this.autoLogins.get(accountId)?.abort()
    this.autoLogins.delete(accountId)
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
  const items = (params as { items?: Array<{ type?: string; text?: string }> }).items
  if (!Array.isArray(items)) return ''
  const texts = items
    .filter((it) => it && (it.type === 'text' || typeof it.text === 'string'))
    .map((it) => it.text ?? '')
    .filter((t) => t.length > 0)
  return texts.join('\n') || ''
}

function extractChatItems(params: unknown): import('../muse-native/chat').MuseChatItem[] {
  if (!params || typeof params !== 'object') return []
  const items = (params as { items?: Array<Record<string, unknown>> }).items
  if (!Array.isArray(items)) return []
  const out: import('../muse-native/chat').MuseChatItem[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const typ = it['type']
    if (typ === 'image' || typ === 'file' || typ === 'file_ref') {
      out.push(it as unknown as import('../muse-native/chat').MuseChatItem)
    }
  }
  return out
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

function toSharedInvite(s: NativeInvite): MuseInviteSnapshot {
  return {
    fetchedAt: s.fetchedAt,
    inviteState: s.inviteState,
    title: s.title,
    subtitle: s.subtitle,
    code: s.code,
    inviteLink: s.inviteLink,
    shareText: s.shareText,
    maxUses: s.maxUses,
    useCount: s.useCount,
    usesRemaining: s.usesRemaining,
    hasRedeemedInviteCode: s.hasRedeemedInviteCode,
    inviteCodeEntryAvailable: s.inviteCodeEntryAvailable,
    reward: s.reward,
    redeemSubtitle: s.redeemSubtitle,
    redeemDisclaimer: s.redeemDisclaimer,
    error: s.error
  }
}

function mapConnectors(raw: unknown): MuseConnectorView[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const nested = o['connectors'] ?? o['items'] ?? o['results']
    if (Array.isArray(nested)) list = nested
  }
  return list.map((item, index) => {
    const r = (item ?? {}) as Record<string, unknown>
    const state = typeof r['state'] === 'string' ? r['state'].toLowerCase() : ''
    const connected = Boolean(
      r['connected'] ??
        r['is_connected'] ??
        (r['status'] === 'connected' || state === 'connected' || state === 'active')
    )
    return {
      id: String(r['id'] ?? r['connector_id'] ?? ('connector-' + String(index))),
      name: String(r['name'] ?? r['title'] ?? r['id'] ?? ('Connector ' + String(index + 1))),
      connected,
      description: typeof r['description'] === 'string' ? r['description'] : undefined
    }
  })
}

function extractOauthUrl(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  for (const key of ['oauth_url', 'oauthUrl', 'auth_url', 'authUrl', 'url', 'redirect_url', 'redirectUrl', 'connect_url', 'connectUrl']) {
    const v = o[key]
    if (typeof v === 'string' && /^https:\/\//i.test(v)) return v
  }
  const nested = o['oauth'] ?? o['authorization'] ?? o['auth']
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>
    for (const key of ['url', 'authorize_url', 'authorizeUrl']) {
      const v = n[key]
      if (typeof v === 'string' && /^https:\/\//i.test(v)) return v
    }
  }
  return undefined
}
