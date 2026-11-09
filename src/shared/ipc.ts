/**
 * IPC contract between the renderer (via preload) and the main process.
 * Shared so channel names and payload shapes cannot drift apart.
 */

export const WEB_VIEW_CHANNELS = {
  create: 'bothub:web-view:create',
  attach: 'bothub:web-view:attach',
  resize: 'bothub:web-view:resize',
  detach: 'bothub:web-view:detach',
  destroy: 'bothub:web-view:destroy',
  clearPartition: 'bothub:web-view:clear-partition'
} as const

/** Rectangle in CSS pixels relative to the window's content area. */
export interface WebViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CreateWebViewRequest {
  botId: string
  accountId: string
  /** http(s) URL to load. Omit to show a local placeholder page. */
  url?: string
  /** Human-readable label (e.g. "Meta Muse · Alex Rivera") for the placeholder. */
  label?: string
}

export interface WebViewInfo {
  /** Stable id for a bot + account pair. */
  viewId: string
  botId: string
  accountId: string
  /** Session partition; one per account so logins stay isolated. */
  partition: string
  url: string
  attached: boolean
}


export const MUSE_CHANNELS = {
  ensure: 'bothub:muse:ensure',
  rpc: 'bothub:muse:rpc',
  status: 'bothub:muse:status',
  event: 'bothub:muse:event',
  signOut: 'bothub:muse:sign-out',
  /** Open a same-partition BrowserWindow for interactive muse.ai login. */
  openLogin: 'bothub:muse:open-login',
  /** Close an unfinished login window and wipe its partition. */
  cancelLogin: 'bothub:muse:cancel-login',
  /** Batch import: drive email one-time-code login in a hidden login window. */
  autoLogin: 'bothub:muse:auto-login',
  /** Reveal a hidden (auto) login window for a manual checkpoint. */
  showLogin: 'bothub:muse:show-login',
  getQuota: 'bothub:muse:quota:get',
  refreshQuota: 'bothub:muse:quota:refresh',
  getInvite: 'bothub:muse:invite:get',
  refreshInvite: 'bothub:muse:invite:refresh',
  redeemInvite: 'bothub:muse:invite:redeem',
  listSchedules: 'bothub:muse:schedules:list',
  listScheduleRuns: 'bothub:muse:schedules:runs',
  runSchedule: 'bothub:muse:schedules:run',
  deleteSchedule: 'bothub:muse:schedules:delete',
  listSessions: 'bothub:muse:sessions:list',
  mutateSession: 'bothub:muse:sessions:mutate',
  listFiles: 'bothub:muse:files:list',
  listConnectors: 'bothub:muse:connectors:list',
  connectConnector: 'bothub:muse:connectors:connect',
  disconnectConnector: 'bothub:muse:connectors:disconnect',
  /** Open https://muse.ai URL in the system browser (Upgrade CTA). */
  openExternal: 'bothub:muse:open-external',
  /** Open any https URL (connector OAuth). */
  openHttps: 'bothub:muse:open-https',
  /** Cancel generation (chat.cancel). */
  cancelChat: 'bothub:muse:chat:cancel',
  /** Start a new session (session.start) or load chat.history for a session. */
  startSession: 'bothub:muse:sessions:start',
  loadSessionHistory: 'bothub:muse:sessions:history',
  /** Tap Muse option widget (Kai/Juno). */
  selectOption: 'bothub:muse:select-option',
  /** fs.raw preview for workspace image/file paths. */
  previewWorkspaceFile: 'bothub:muse:files:preview',
  /** Chunked fs.write eager upload → file_ref path. */
  uploadWorkspaceFile: 'bothub:muse:files:upload',
  getProxy: 'bothub:muse:proxy:get',
  setProxy: 'bothub:muse:proxy:set',
  listProxyPool: 'bothub:muse:proxy-pool:list',
  importProxyPool: 'bothub:muse:proxy-pool:import',
  removeProxyPoolItem: 'bothub:muse:proxy-pool:remove',
  clearProxyPool: 'bothub:muse:proxy-pool:clear',
  assignProxyPool: 'bothub:muse:proxy-pool:assign'
} as const

export interface MuseEnsureRequest {
  botId: string
  accountId: string
  /** When true, attach/show the view for interactive login. */
  show?: boolean
  bounds?: WebViewBounds
}

export interface MuseRpcRequest {
  accountId: string
  method: string
  params?: unknown
  /** BotHub conversation/bot id — used to emit progressive stream events for chat.stream. */
  conversationId?: string
}

export interface MuseSessionStatus {
  accountId: string
  signedIn: boolean
  ready: boolean
  hook: 'sendRequest' | 'dom' | 'none'
  url: string
  pendingApprovals: number
  /** Connection lifecycle for UI: connecting → waking-vm → ready. */
  phase?: MuseConnectionPhase
  /** Human-readable detail for the current phase. */
  phaseDetail?: string
}

export type MuseConnectionPhase = 'signed-out' | 'connecting' | 'hydrating' | 'waking-vm' | 'reloading' | 'ready'


/** Renderer-safe option chip widget (onboarding Kai/Juno, etc.). */
export interface MuseToolCallView {
  id: string
  name: string
  toolType?: string
  status: 'running' | 'completed' | 'errored'
  summary?: string
}

export interface MuseMediaPartView {
  kind: 'image' | 'file'
  path: string
  name?: string
  imageId?: string
  mimeType?: string
}

export type MuseRichWidgetView =
  | {
      kind: 'shopping_results' | 'shopping_results_v2'
      widgetId: string
      products: Array<{ name: string; url?: string; imageUrl?: string; price?: string; retailer?: string }>
    }
  | {
      kind: 'shopping_cart'
      widgetId: string
      retailerName?: string
      subtotal?: string
      items: Array<{ id: string; name: string; quantity: number; imageUrl?: string; linePrice?: string }>
    }
  | {
      kind: 'local_map'
      widgetId: string
      html?: string
      places: Array<{ id: string; name: string; latitude: number; longitude: number; category?: string }>
    }
  | {
      kind: 'marketplace_map'
      widgetId: string
      listings: Array<{
        id: string
        name: string
        url?: string
        price?: string
        imageUrl?: string
        latitude?: number
        longitude?: number
      }>
    }
  | { kind: 'html'; widgetId: string; html: string; downloadable?: boolean }
  | { kind: 'slides'; widgetId: string; label: string; path?: string; slug: string }
  | {
      kind: 'image_options'
      widgetId: string
      images: Array<{ path: string; imageId?: string }>
      multiSelect?: boolean
      selectedPath?: string | null
      selectedIndices?: number[]
      baseVersion: number
    }
  | {
      kind: 'text_with_button'
      widgetId: string
      text: string
      buttons: Array<{ label: string; actionText?: string; url?: string; command?: string }>
    }
  | {
      kind: 'generic_list'
      widgetId: string
      title?: string
      items: Array<{ id: string; title: string; subtitle?: string; sendText?: string; url?: string }>
    }
  | {
      kind: 'voice_options'
      widgetId: string
      voices: Array<{ id: string; name: string; description?: string; selected?: boolean }>
    }
  | {
      kind: 'markdown'
      widgetId: string
      title?: string
      markdown: string
      path?: string
    }
  | {
      kind: 'hotel_results'
      widgetId: string
      hotels: Array<{ name: string; price?: string; rating?: string; url?: string; imageUrl?: string; location?: string }>
    }
  | {
      kind: 'idea_cards'
      widgetId: string
      cards: Array<{ id: string; title: string; subtitle?: string; prompt?: string }>
    }

export interface MuseOptionWidgetView {
  kind: 'option'
  widgetId: string
  options: string[]
  buttonStyle: 'dotted_lines' | 'center_aligned_filled'
  customInputPlaceholder?: string
  selectedText?: string | null
  baseVersion: number
}


export type MuseProxyMode = 'direct' | 'http' | 'socks5' | 'socks5h'

/** Renderer-safe proxy view (password never returned). */
export interface MuseProxyView {
  mode: MuseProxyMode
  host?: string
  port?: number
  username?: string
  hasPassword: boolean
}

export interface MuseProxyConfigInput {
  mode: MuseProxyMode
  host?: string
  port?: number
  username?: string
  /** Empty string keeps previous password when hasPassword. */
  password?: string
}

export interface MuseProxyPoolItemView {
  id: string
  mode: Exclude<MuseProxyMode, 'direct'>
  host: string
  port: number
  username?: string
  hasPassword: boolean
  assignedAccountId?: string
}

export type MuseMainEvent =
  | { type: 'status'; status: MuseSessionStatus }
  /** The platform acknowledged the user message of the turn in flight. */
  | { type: 'sent'; accountId: string; conversationId?: string }
  | { type: 'approvals'; accountId: string; pending: unknown[] }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      messageId: string
      text: string
      done: boolean
      widgets?: MuseOptionWidgetView[]
      richWidgets?: MuseRichWidgetView[]
      tools?: MuseToolCallView[]
      media?: MuseMediaPartView[]
    }
  | {
      type: 'activity'
      accountId: string
      activityCode: string
      activityText?: string
      activityEmoji?: string
      agentId?: string
      subagents?: number
      busy: boolean
      ctaLabel?: string
    }
  | {
      type: 'login'
      accountId: string
      signedIn: boolean
      handle?: string
      displayName?: string
      /** Set when the login window was closed before a session appeared. */
      windowClosed?: boolean
    }
  | { type: 'quota'; accountId: string; snapshot: MuseQuotaSnapshot }
  | { type: 'schedules'; accountId: string; schedules: MuseSchedule[] }
  | { type: 'invite'; accountId: string; snapshot: MuseInviteSnapshot }
  | { type: 'sessions'; accountId: string; sessions: MuseChatSessionView[] }
  | { type: 'files'; accountId: string; files: MuseFileEntryView[] }
  | { type: 'connectors'; accountId: string; connectors: MuseConnectorView[] }

/** Renderer-safe quota snapshot (no cookies/tokens). */
export interface MuseQuotaSnapshot {
  fetchedAt: number
  stale: boolean
  success: boolean
  subscription: MuseSubscriptionView | null
  error?: string
  inviteUsesRemaining?: number | null
}

export interface MuseSubscriptionView {
  tier: { tierId: string; name: string; tierCode: string; isPaid: boolean; rank: number }
  usage: { state: string; percentUsed: number; resetsAt: number | null; quotaStatus: string }
  statusSubtitle: string | null
  usageRowLabel: string | null
  usageRowValueLabel: string | null
  usageRowFooter: string | null
  billingSubtitle: string | null
  topupBalance: number | null
  topupTotal: number | null
  topupRowLabel: string | null
  topupRowValueLabel: string | null
  topupEligible: boolean | null
  entryPointCtaLabel: string | null
}

export interface MuseSchedule {
  id: string
  title: string
  scheduleKey: string
  timezone: string | null
  isHeartbeat: boolean
  mode: string | null
  enabled: boolean
  nextRunAtUtc: number | null
  cadenceLabel: string
}

export interface MuseTaskRun {
  id: string
  jobId: string
  status: string
  startedAtUtc: number | null
  finishedAtUtc: number | null
  title: string | null
}

/** Renderer-safe invite snapshot (may include code for copy — never log it). */
export interface MuseInviteSnapshot {
  fetchedAt: number
  inviteState: string
  title: string | null
  subtitle: string | null
  code: string | null
  inviteLink: string | null
  shareText: string | null
  maxUses: number | null
  useCount: number | null
  usesRemaining: number | null
  hasRedeemedInviteCode: boolean
  inviteCodeEntryAvailable: boolean
  reward: { title: string | null; body: string | null } | null
  redeemSubtitle: string | null
  redeemDisclaimer: string | null
  error?: string
}

export type MuseSessionMutation =
  | { op: 'archive' | 'unarchive' | 'pin' | 'unpin' | 'delete'; sessionId: string }
  | { op: 'rename'; sessionId: string; title: string }

export interface MuseHistoryMessageView {
  id: string
  role: 'user' | 'bot'
  text: string
  createdAt: number
  widgets?: MuseOptionWidgetView[]
  richWidgets?: MuseRichWidgetView[]
  tools?: MuseToolCallView[]
  media?: MuseMediaPartView[]
}

export interface MuseChatSessionView {
  id: string
  title: string
  pinned: boolean
  archived: boolean
  updatedAtMs: number | null
  createdAtMs: number | null
  preview: string | null
}

export interface MuseFileEntryView {
  id: string
  name: string
  kind: string
  path: string | null
  sizeBytes: number | null
  mimeType: string | null
  pinned: boolean
  updatedAtMs: number | null
  source: 'artifact' | 'library' | 'fs'
}

export interface MuseConnectorView {
  id: string
  name: string
  connected: boolean
  description?: string
}

export interface MuseConnectorConnectResult {
  ok: boolean
  /** Present when the user must finish OAuth in an external browser. */
  oauthUrl?: string
  message?: string
}

export const UPDATE_CHANNELS = {
  check: 'bothub:update:check',
  install: 'bothub:update:install',
  version: 'bothub:update:version',
  event: 'bothub:update:event'
} as const

export type UpdateStatusEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string; manualInstall?: boolean }
  | { type: 'not-available'; version: string }
  | {
      type: 'downloading'
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
  | { type: 'downloaded'; version: string; releaseNotes?: string }
  | { type: 'error'; message: string }


export const GROK_CHANNELS = {
  openLogin: 'bothub:grok:open-login',
  setAccessToken: 'bothub:grok:set-access-token',
  clearAuth: 'bothub:grok:clear-auth',
  authStatus: 'bothub:grok:auth-status',
  getSession: 'bothub:grok:get-session',
  rpc: 'bothub:grok:rpc',
  event: 'bothub:grok:event'
} as const

export type GrokMainEvent =
  | {
      type: 'auth'
      accountId: string
      signedIn: true
      accessToken: string
      accountSlot?: string
      machineId?: string
    }
  | { type: 'auth'; accountId: string; signedIn: false }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      agentId: string
      messageId: string
      text: string
      done: boolean
      widgets?: MuseOptionWidgetView[]
      tools?: MuseToolCallView[]
      media?: MuseMediaPartView[]
      richWidgets?: MuseRichWidgetView[]
    }

export interface GrokOpenLoginRequest {
  accountId: string
}

export interface GrokSetAccessTokenRequest {
  accountId: string
  accessToken: string
  refreshToken?: string
  accountSlot?: string
  teamId?: string
  machineId?: string
}

export interface GrokAuthStatus {
  accountId: string
  signedIn: boolean
  accountSlot?: string
}

/** In-memory session hydrate for renderer (never written to disk). */
export interface GrokAuthSessionPayload {
  accountId: string
  signedIn: boolean
  accessToken?: string
  accountSlot?: string
  teamId?: string
  machineId?: string
}

/** Renderer → main ConnectRPC unary (avoids api2 CORS). */
export type GrokRpcRequest =
  | {
      accountId: string
      timeZone?: string
      op: 'listAgents'
      role?: string
      includeTeamAgents?: boolean
    }
  | {
      accountId: string
      timeZone?: string
      op: 'listAgentStatuses'
      agentIds?: string[]
    }
  | {
      accountId: string
      timeZone?: string
      op: 'sendUserMessage'
      agentId: string
      messageId: string
      text: string
      sessionId?: string
      machineId?: string
      sentAtMs?: number
    }
  | {
      accountId: string
      timeZone?: string
      op: 'getSendStatus'
      agentId: string
      messageId: string
      sessionId?: string
    }
  | {
      accountId: string
      timeZone?: string
      op: 'listTranscriptEntries'
      agentId: string
      sessionId?: string
      limit?: number
      beforeSeq?: string
    }
  | {
      accountId: string
      timeZone?: string
      op: 'watchUntilReply'
      agentId: string
      conversationId?: string
      sessionId?: string
      afterUpdatedSeq?: string
      afterMessageId?: string
      timeoutMs?: number
    }
  | {
      accountId: string
      timeZone?: string
      op: 'call'
      method: string
      params?: Record<string, unknown>
    }
  | {
      accountId: string
      timeZone?: string
      op: 'resolveAutoReview'
      agentId: string
      requestId: string
      resolution: number
      sessionId?: string
      approvalPlatform?: string
      approvedCommand?: string
    }
  | {
      accountId: string
      timeZone?: string
      op: 'resolveLocalTool'
      agentId: string
      requestId: string
      resolution: number
      sessionId?: string
    }
  | {
      accountId: string
      timeZone?: string
      op: 'resolveConnectorGrant'
      agentId: string
      requestId: string
      resolution: number
      sessionId?: string
    }

export type GrokRpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code?: string; message: string; body?: string }


export const HARK_CHANNELS = {
  openLogin: 'bothub:hark:open-login',
  cancelLogin: 'bothub:hark:cancel-login',
  authStatus: 'bothub:hark:auth-status',
  importCredentials: 'bothub:hark:import-credentials',
  clearAuth: 'bothub:hark:clear-auth',
  rpc: 'bothub:hark:rpc',
  event: 'bothub:hark:event'
} as const

export type HarkMainEvent =
  | {
      type: 'login'
      accountId: string
      signedIn: true
      handle?: string
      displayName?: string
    }
  | {
      type: 'login'
      accountId: string
      signedIn: false
      windowClosed?: boolean
    }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      messageId: string
      text: string
      done: boolean
      tools?: MuseToolCallView[]
      media?: MuseMediaPartView[]
      richWidgets?: MuseRichWidgetView[]
    }
  | {
      type: 'activity'
      accountId: string
      activityCode: string
      activityText?: string
      activityEmoji?: string
      busy: boolean
    }

export interface HarkOpenLoginRequest {
  accountId: string
}

export interface HarkImportCredentialsRequest {
  accountId: string
  rawInput: string
}

export interface HarkAuthStatus {
  accountId: string
  signedIn: boolean
  handle?: string
  displayName?: string
}

export type HarkRpcRequest =
  | { accountId: string; op: 'authStatus' }
  | { accountId: string; op: 'getSession' }
  | { accountId: string; op: 'profile' }
  | { accountId: string; op: 'listConversations' }
  | { accountId: string; op: 'mainConversation'; timezone?: string }
  | { accountId: string; op: 'conversationStatus' }
  | {
      accountId: string
      op: 'sendMessage'
      conversationId: string
      text: string
      timezone?: string
      attachments?: Array<{ name: string; mimeType: string; dataBase64: string }>
    }
  | {
      accountId: string
      op: 'pollReply'
      conversationId: string
      botId?: string
      responseMessageId?: string
      timezone?: string
      afterMessageCount?: number
      afterMessageIds?: string[]
      timeoutMs?: number
    }
  | {
      accountId: string
      op: 'downloadArtifact'
      url?: string
      fileId?: string
      name?: string
    }
  | {
      accountId: string
      op: 'call'
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
      path: string
      query?: Record<string, string | undefined>
      body?: unknown
    }

export type HarkRpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code?: string; message: string; body?: string }


export const DOT_CHANNELS = {
  openLogin: 'bothub:dot:open-login',
  cancelLogin: 'bothub:dot:cancel-login',
  authStatus: 'bothub:dot:auth-status',
  importCredentials: 'bothub:dot:import-credentials',
  clearAuth: 'bothub:dot:clear-auth',
  rpc: 'bothub:dot:rpc',
  event: 'bothub:dot:event'
} as const

export type DotMainEvent =
  /** The room message of the send in flight was posted. */
  | { type: 'sent'; accountId: string }
  | {
      type: 'login'
      accountId: string
      signedIn: true
      handle?: string
      displayName?: string
      planType?: string
      chatgptAccountId?: string
    }
  | {
      type: 'login'
      accountId: string
      signedIn: false
      windowClosed?: boolean
    }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      dotId?: string
      messageId: string
      text: string
      done: boolean
      stillBusy?: boolean
      tools?: MuseToolCallView[]
      media?: MuseMediaPartView[]
      richWidgets?: MuseRichWidgetView[]
    }
  | {
      type: 'activity'
      accountId: string
      activityCode: string
      activityText?: string
      activityEmoji?: string
      busy: boolean
    }

export interface DotOpenLoginRequest {
  accountId: string
}

export interface DotAuthStatus {
  accountId: string
  signedIn: boolean
  handle?: string
  displayName?: string
  planType?: string
  chatgptAccountId?: string
  activeDotId?: string
  roomId?: string
  threadId?: string
  mode?: 'dot' | 'native'
  model?: string
  effort?: string
  hasRefreshToken?: boolean
  expiresAtMs?: number
  updatedAt?: number
  hasProxy?: boolean
  migration?: {
    goalCopied: boolean
    memoriesCopied: number
  }
}

export interface DotImportCredentialsRequest {
  accountId: string
  /** Raw ChatGPT access_token (eyJ...), refresh_token (rt_...), or JSON (auth.json / session JSON). */
  rawInput: string
  refreshToken?: string
  chatgptAccountId?: string
  proxyUrl?: string
  /** Optional source accountId to migrate Dot goal & memory from when replacing credentials. */
  migrateDataFromAccountId?: string
}

export type DotRpcRequest =
  | { accountId: string; op: 'authStatus' }
  | { accountId: string; op: 'listStoredAccounts' }
  | { accountId: string; op: 'listDots'; ensureDefault?: boolean }
  | { accountId: string; op: 'createDot'; displayName?: string; color?: string }
  | { accountId: string; op: 'getDot'; dotId: string }
  | { accountId: string; op: 'deleteDot'; dotId: string }
  | { accountId: string; op: 'selectDot'; dotId: string; botId?: string }
  | { accountId: string; op: 'pauseRuntime'; dotId?: string }
  | { accountId: string; op: 'resumeRuntime'; dotId?: string }
  | { accountId: string; op: 'cancelTurn'; dotId?: string }
  | { accountId: string; op: 'listThreads'; dotId?: string }
  | {
      accountId: string
      op: 'listRoomMessages'
      roomId?: string
      dotId?: string
      limit?: number
      after?: string
    }
  | {
      accountId: string
      op: 'sendMessage'
      botId?: string
      dotId?: string
      roomId?: string
      text: string
      mode?: 'dot' | 'native'
      model?: string
      effort?: string
      attachments?: Array<{ name: string; mimeType: string; dataBase64: string }>
    }
  | {
      accountId: string
      op: 'setMode'
      mode: 'dot' | 'native'
      model?: string
      effort?: string
    }
  | { accountId: string; op: 'rateLimits' }
  | { accountId: string; op: 'listModels' }
  | { accountId: string; op: 'listLibrary'; limit?: number }
  | {
      accountId: string
      op: 'downloadFile'
      url?: string
      downloadUrl?: string
      fileId?: string
      roomId?: string
      name?: string
    }
  | { accountId: string; op: 'createPage'; title: string; layout?: 'document' | 'spatial' }
  | { accountId: string; op: 'deletePage'; pageId: string }
  | { accountId: string; op: 'getGoal'; threadId?: string }
  | { accountId: string; op: 'setGoal'; threadId?: string; goal: string }
  | { accountId: string; op: 'clearGoal'; threadId?: string }
  | {
      accountId: string
      op: 'exportMemory'
      mode?: 'fast' | 'deep'
      dotId?: string
      roomId?: string
    }
  | {
      accountId: string
      op: 'importMemory'
      markdown: string
      goal?: string
      botId?: string
      dotId?: string
      roomId?: string
    }
  | {
      accountId: string
      op: 'call'
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
      path: string
      query?: Record<string, string | undefined>
      body?: unknown
    }

export type DotRpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code?: string; message: string; body?: string }

