/**
 * Per-account BotHub client egress proxy (not a Muse RPC).
 * Persist via Electron safeStorage; apply to session partition + Noise WSS agent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { app, safeStorage, session as electronSession } from "electron"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"
import type { Agent } from "node:https"
import { partitionForAccount } from "../webContentsViewManager"

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
  const p = storePath()
  if (!existsSync(p)) return {}
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as unknown
    return raw && typeof raw === "object" ? (raw as StoreFile) : {}
  } catch {
    return {}
  }
}

function writeStore(store: StoreFile): void {
  const p = storePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 })
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
  const store = readStore()
  delete store[accountId]
  writeStore(store)
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

export async function applyProxyToPartition(accountId: string, cfg?: MuseProxyConfig): Promise<void> {
  const c = cfg ?? (await loadProxyConfig(accountId))
  const ses = electronSession.fromPartition(partitionForAccount(accountId))
  if (c.mode === "direct") {
    await ses.setProxy({ mode: "direct" })
    return
  }
  const url = proxyUrl(c)
  if (!url) {
    await ses.setProxy({ mode: "direct" })
    return
  }
  // Electron honors proxyRules for partition fetch + WebContents login window.
  await ses.setProxy({ proxyRules: url, proxyBypassRules: "<local>" })
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
  const p = poolStorePath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as unknown
    return Array.isArray(raw) ? (raw as StoredPoolItem[]) : []
  } catch {
    return []
  }
}

function writePoolStore(list: StoredPoolItem[]): void {
  const p = poolStorePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(list, null, 2), { encoding: "utf8", mode: 0o600 })
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
  const items = await listProxyPool()
  return { added, total: items.length, items }
}

export async function removeProxyPoolItem(id: string): Promise<MuseProxyPoolItemView[]> {
  const list = readPoolStore().filter((x) => x.id !== id)
  writePoolStore(list)
  return listProxyPool()
}

export async function clearProxyPool(): Promise<MuseProxyPoolItemView[]> {
  writePoolStore([])
  return []
}

/**
 * Match 1 proxy from the pool to each accountId in `accountIds` (1-to-1).
 * Accounts that already have a pool proxy keep it; unassigned accounts get the
 * next free pool proxy (or round-robin if pool is smaller than accounts).
 */
export async function assignProxyPoolToAccounts(
  accountIds: string[],
  onAssigned?: (accountId: string) => Promise<void>
): Promise<{ assignedCount: number; items: MuseProxyPoolItemView[] }> {
  const pool = readPoolStore()
  if (pool.length === 0 || accountIds.length === 0) {
    return { assignedCount: 0, items: await listProxyPool() }
  }

  const validAccountSet = new Set(accountIds)
  // Release assignments for deleted accounts
  for (const item of pool) {
    if (item.assignedAccountId && !validAccountSet.has(item.assignedAccountId)) {
      item.assignedAccountId = undefined
    }
  }

  let assignedCount = 0
  for (const accountId of accountIds) {
    // Already has a pool item assigned?
    let item = pool.find((p) => p.assignedAccountId === accountId)
    if (!item) {
      // Find first unassigned proxy in pool
      item = pool.find((p) => !p.assignedAccountId)
    }
    if (!item) continue
    item.assignedAccountId = accountId
    const cfg = await decryptPoolItem(item)
    if (cfg && cfg.mode !== "direct") {
      await saveProxyConfig(accountId, cfg)
      await onAssigned?.(accountId)
      assignedCount += 1
    }
  }

  writePoolStore(pool)
  return { assignedCount, items: await listProxyPool() }
}
