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
