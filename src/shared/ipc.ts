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
  openHttps: 'bothub:muse:open-https'
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

export type MuseMainEvent =
  | { type: 'status'; status: MuseSessionStatus }
  | { type: 'approvals'; accountId: string; pending: unknown[] }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      messageId: string
      text: string
      done: boolean
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

export interface GrokOpenLoginRequest {
  accountId: string
}

export interface GrokSetAccessTokenRequest {
  accountId: string
  accessToken: string
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
      sessionId?: string
      afterUpdatedSeq?: string
      afterMessageId?: string
      timeoutMs?: number
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

export interface HarkOpenLoginRequest {
  accountId: string
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
    }
  | {
      accountId: string
      op: 'pollReply'
      conversationId: string
      timezone?: string
      afterMessageCount?: number
      afterMessageIds?: string[]
      timeoutMs?: number
    }

export type HarkRpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code?: string; message: string; body?: string }
