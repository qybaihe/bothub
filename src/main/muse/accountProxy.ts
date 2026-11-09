/**
 * Per-account BotHub client egress proxy (not a Muse RPC).
 * Persist via Electron safeStorage; apply to session partition + Noise WSS agent.
 */
import { join } from "node:path"
import { app, safeStorage, session as electronSession } from "electron"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"
import type { Agent } from "node:https"
import { partitionForAccount } from "../webContentsViewManager"
import { readJsonFile, writeJsonAtomic } from "../jsonFile"
import { chromiumProxyRule, createMutex, planPoolAssignment, releasePoolSlot } from "@shared/proxyPool"
import type { Session } from "electron"

/** One lock for both proxy files: every change is read-modify-write across awaits. */
const withProxyStoreLock = createMutex()

export type MuseProxyMode = "direct" | "http" | "socks5" | "socks5h"

export interface MuseProxyConfig {
  mode: MuseProxyMode
  host?: string
  port?: number
  username?: string
  password?: string
}

interface StoredEntry {
  enc: string
}

type StoreFile = Record<string, StoredEntry>

function storePath(): string {
  return join(app.getPath("userData"), "muse-account-proxy.json")
}

function readStore(): StoreFile {
  return readJsonFile<StoreFile>(storePath(), {}, (raw) => Boolean(raw) && typeof raw === "object" && !Array.isArray(raw))
}

function writeStore(store: StoreFile): void {
  writeJsonAtomic(storePath(), store)
}

function normalize(cfg: MuseProxyConfig | null | undefined): MuseProxyConfig {
  if (!cfg || cfg.mode === "direct") return { mode: "direct" }
  const host = (cfg.host || "").trim()
  const port = Number(cfg.port)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Proxy host and port (1–65535) are required")
  }
  return {
    mode: cfg.mode,
    host,
    port,
    username: cfg.username?.trim() || undefined,
    password: cfg.password || undefined
  }
}

/** Public view never returns the password; only whether one is stored. */
export type MuseProxyView = {
  mode: MuseProxyMode
  host?: string
  port?: number
  username?: string
  hasPassword: boolean
}

export async function loadProxyConfig(accountId: string): Promise<MuseProxyConfig> {
  const entry = readStore()[accountId]
  if (!entry?.enc) return { mode: "direct" }
  try {
    const available = await safeStorage.isAsyncEncryptionAvailable()
    if (!available) return { mode: "direct" }
    const decrypted = await safeStorage.decryptStringAsync(Buffer.from(entry.enc, "base64"))
    const parsed = JSON.parse(decrypted.result) as MuseProxyConfig
    return normalize(parsed)
  } catch {
    return { mode: "direct" }
  }
}

export async function getProxyView(accountId: string): Promise<MuseProxyView> {
  const cfg = await loadProxyConfig(accountId)
  if (cfg.mode === "direct") return { mode: "direct", hasPassword: false }
  return {
    mode: cfg.mode,
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    hasPassword: Boolean(cfg.password)
  }
}

export async function saveProxyConfig(accountId: string, input: MuseProxyConfig): Promise<MuseProxyView> {
  return withProxyStoreLock(() => saveProxyConfigUnlocked(accountId, input))
}

async function saveProxyConfigUnlocked(accountId: string, input: MuseProxyConfig): Promise<MuseProxyView> {
  const next = normalize(input)
  const store = readStore()
  if (next.mode === "direct") {
    delete store[accountId]
    writeStore(store)
    await applyProxyToPartition(accountId, next)
    return { mode: "direct", hasPassword: false }
  }
  // Keep previous password when UI sends empty password + has existing.
  if (!next.password) {
    const prev = await loadProxyConfig(accountId)
    if (prev.password) next.password = prev.password
  }
  const available = await safeStorage.isAsyncEncryptionAvailable()
  if (!available) {
    throw new Error("safeStorage encryption unavailable; refusing to store proxy credentials in plaintext")
  }
  const enc = await safeStorage.encryptStringAsync(JSON.stringify(next))
  store[accountId] = { enc: enc.toString("base64") }
  writeStore(store)
  await applyProxyToPartition(accountId, next)
  return {
    mode: next.mode,
    host: next.host,
    port: next.port,
    username: next.username,
    hasPassword: Boolean(next.password)
  }
}

export async function clearProxyConfig(accountId: string): Promise<void> {
  await withProxyStoreLock(() => {
    const store = readStore()
    delete store[accountId]
    writeStore(store)
  })
  await applyProxyToPartition(accountId, { mode: "direct" })
}

function proxyUrl(cfg: MuseProxyConfig): string | null {
  if (cfg.mode === "direct" || !cfg.host || !cfg.port) return null
  const auth =
    cfg.username && cfg.password
      ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}@`
      : cfg.username
        ? `${encodeURIComponent(cfg.username)}@`
        : ""
  const scheme = cfg.mode === "http" ? "http" : cfg.mode
  return `${scheme}://${auth}${cfg.host}:${cfg.port}`
}

/** Proxy credentials per partition session, answered from `app.on('login')`. */
const proxyCredentials = new WeakMap<Session, { username: string; password: string }>()
let loginHandlerInstalled = false

function installProxyLoginHandler(): void {
  if (loginHandlerInstalled) return
  loginHandlerInstalled = true
  app.on("login", (event, webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy || !webContents) return
    const creds = proxyCredentials.get(webContents.session)
    if (!creds) return
    event.preventDefault()
    callback(creds.username, creds.password)
  })
}

export async function applyProxyToPartition(accountId: string, cfg?: MuseProxyConfig): Promise<void> {
  const c = cfg ?? (await loadProxyConfig(accountId))
  const ses = electronSession.fromPartition(partitionForAccount(accountId))
  const rule = chromiumProxyRule(c)
  if (!rule) {
    proxyCredentials.delete(ses)
    await ses.setProxy({ mode: "direct" })
    return
  }
  // Chromium ignores user:pass in proxyRules; answer the 407 challenge instead
  // (SOCKS5 username/password is not supported by Chromium at all).
  if (c.username) {
    proxyCredentials.set(ses, { username: c.username, password: c.password ?? "" })
    installProxyLoginHandler()
  } else {
    proxyCredentials.delete(ses)
  }
  await ses.setProxy({ proxyRules: rule, proxyBypassRules: "<local>" })
}

/** Node `ws` / HTTPS agent for Noise WSS (session.setProxy does not cover Node ws). */
export async function createProxyAgent(accountId: string): Promise<Agent | undefined> {
  const cfg = await loadProxyConfig(accountId)
  const url = proxyUrl(cfg)
  if (!url) return undefined
  if (cfg.mode === "http") return new HttpsProxyAgent(url) as unknown as Agent
  return new SocksProxyAgent(url) as unknown as Agent
}

export interface MuseProxyPoolItemView {
  id: string
  mode: Exclude<MuseProxyMode, "direct">
  host: string
  port: number
  username?: string
  hasPassword: boolean
  assignedAccountId?: string
}

interface StoredPoolItem {
  id: string
  enc: string
  assignedAccountId?: string
}

function poolStorePath(): string {
  return join(app.getPath("userData"), "muse-proxy-pool.json")
}

function readPoolStore(): StoredPoolItem[] {
  return readJsonFile<StoredPoolItem[]>(poolStorePath(), [], Array.isArray)
}

function writePoolStore(list: StoredPoolItem[]): void {
  writeJsonAtomic(poolStorePath(), list)
}

/** Parse one proxy line (`socks5://u:p@h:p`, `http://h:p`, `h:p:u:p`, `h:p`). */
export function parseProxyLine(
  line: string,
  defaultMode: Exclude<MuseProxyMode, "direct"> = "socks5"
): MuseProxyConfig | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return null

  const schemeMatch = /^(https?|socks5h?):\/\/(.+)$/i.exec(trimmed)
  if (schemeMatch) {
    const rawScheme = schemeMatch[1]!.toLowerCase()
    const mode: Exclude<MuseProxyMode, "direct"> =
      rawScheme === "socks5h" ? "socks5h" : rawScheme === "socks5" ? "socks5" : "http"
    const rest = schemeMatch[2]!.replace(/\/.*$/, "")
    const atIdx = rest.lastIndexOf("@")
    const hostPort = atIdx >= 0 ? rest.slice(atIdx + 1) : rest
    const authPart = atIdx >= 0 ? rest.slice(0, atIdx) : ""
    const colonIdx = hostPort.lastIndexOf(":")
    if (colonIdx <= 0) return null
    const host = hostPort.slice(0, colonIdx).trim()
    const port = Number(hostPort.slice(colonIdx + 1))
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
    let username: string | undefined
    let password: string | undefined
    if (authPart) {
      const cIdx = authPart.indexOf(":")
      if (cIdx >= 0) {
        username = decodeURIComponent(authPart.slice(0, cIdx))
        password = decodeURIComponent(authPart.slice(cIdx + 1))
      } else {
        username = decodeURIComponent(authPart)
      }
    }
    return { mode, host, port, username: username || undefined, password: password || undefined }
  }

  // host:port:user:pass or user:pass@host:port or host:port
  if (trimmed.includes("@")) {
    const atIdx = trimmed.lastIndexOf("@")
    const authPart = trimmed.slice(0, atIdx)
    const hostPort = trimmed.slice(atIdx + 1)
    const [host, portStr] = hostPort.split(":")
    const port = Number(portStr)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
    const [u, ...pRest] = authPart.split(":")
    return {
      mode: defaultMode,
      host: host.trim(),
      port,
      username: u?.trim() || undefined,
      password: pRest.join(":") || undefined
    }
  }

  const parts = trimmed.split(":")
  if (parts.length >= 2) {
    const host = parts[0]!.trim()
    const port = Number(parts[1])
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
    const username = parts[2]?.trim() || undefined
    const password = parts.length > 3 ? parts.slice(3).join(":") : undefined
    return { mode: defaultMode, host, port, username, password }
  }
  return null
}

async function decryptPoolItem(item: StoredPoolItem): Promise<MuseProxyConfig | null> {
  try {
    const available = await safeStorage.isAsyncEncryptionAvailable()
    if (!available) return null
    const dec = await safeStorage.decryptStringAsync(Buffer.from(item.enc, "base64"))
    return normalize(JSON.parse(dec.result) as MuseProxyConfig)
  } catch {
    return null
  }
}

export async function listProxyPool(): Promise<MuseProxyPoolItemView[]> {
  const list = readPoolStore()
  const out: MuseProxyPoolItemView[] = []
  for (const item of list) {
    const cfg = await decryptPoolItem(item)
    if (!cfg || cfg.mode === "direct" || !cfg.host || !cfg.port) continue
    out.push({
      id: item.id,
      mode: cfg.mode,
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      hasPassword: Boolean(cfg.password),
      assignedAccountId: item.assignedAccountId
    })
  }
  return out
}

export async function importProxyPool(
  rawText: string,
  defaultMode: Exclude<MuseProxyMode, "direct"> = "socks5"
): Promise<{ added: number; total: number; items: MuseProxyPoolItemView[] }> {
  const available = await safeStorage.isAsyncEncryptionAvailable()
  if (!available) {
    throw new Error("safeStorage encryption unavailable")
  }
  const added = await withProxyStoreLock(() => importIntoPoolUnlocked(rawText, defaultMode))
  const items = await listProxyPool()
  return { added, total: items.length, items }
}

async function importIntoPoolUnlocked(
  rawText: string,
  defaultMode: Exclude<MuseProxyMode, "direct">
): Promise<number> {
  const existing = readPoolStore()
  const existingConfigs = await Promise.all(existing.map(decryptPoolItem))
  const seenKeys = new Set(
    existingConfigs
      .filter((c): c is MuseProxyConfig => Boolean(c && c.host && c.port))
      .map((c) => `${c.mode}://${c.username || ""}@${c.host}:${c.port}`)
  )

  let added = 0
  for (const line of rawText.split(/\r?\n/)) {
    const parsed = parseProxyLine(line, defaultMode)
    if (!parsed || parsed.mode === "direct" || !parsed.host || !parsed.port) continue
    const key = `${parsed.mode}://${parsed.username || ""}@${parsed.host}:${parsed.port}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    const enc = await safeStorage.encryptStringAsync(JSON.stringify(parsed))
    existing.push({
      id: `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      enc: enc.toString("base64")
    })
    added += 1
  }
  writePoolStore(existing)
  return added
}

export async function removeProxyPoolItem(id: string): Promise<MuseProxyPoolItemView[]> {
  await withProxyStoreLock(() => writePoolStore(readPoolStore().filter((x) => x.id !== id)))
  return listProxyPool()
}

export async function clearProxyPool(): Promise<MuseProxyPoolItemView[]> {
  await withProxyStoreLock(() => writePoolStore([]))
  return []
}

/**
 * Match 1 proxy from the pool to each accountId in `accountIds` (1-to-1).
 * Accounts that already have a pool proxy keep it; unassigned accounts get the
 * next free pool proxy (or round-robin if pool is smaller than accounts).
 */
export async function assignProxyPoolToAccounts(
  accountIds: string[],
  onAssigned?: (accountId: string) => Promise<void>,
  keep?: (accountId: string) => boolean
): Promise<{ assignedCount: number; items: MuseProxyPoolItemView[] }> {
  const configured = await withProxyStoreLock(async () => {
    const pool = readPoolStore()
    if (pool.length === 0 || accountIds.length === 0) return [] as string[]
    // Pool exhausted → the account keeps its current setting (no sharing).
    const plan = planPoolAssignment(pool, accountIds, keep)
    const done: string[] = []
    for (const { accountId, slot } of plan.assigned) {
      const cfg = await decryptPoolItem(slot)
      if (cfg && cfg.mode !== "direct") {
        await saveProxyConfigUnlocked(accountId, cfg)
        done.push(accountId)
      }
    }
    writePoolStore(plan.pool)
    return done
  })
  for (const accountId of configured) await onAssigned?.(accountId)
  return { assignedCount: configured.length, items: await listProxyPool() }
}

/** Give an account's pool proxy back (failed/cancelled login) and drop its config. */
export async function releaseProxyPoolAccount(accountId: string): Promise<void> {
  const held = await withProxyStoreLock(() => {
    const pool = readPoolStore()
    if (!pool.some((p) => p.assignedAccountId === accountId)) return false
    writePoolStore(releasePoolSlot(pool, accountId))
    return true
  })
  if (held) await clearProxyConfig(accountId)
}
