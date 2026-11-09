import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'bothub-proxy-'))
const setProxy = vi.fn(async (_cfg: unknown) => undefined)
let encryptionAvailable = true

vi.mock('electron', () => ({
  app: { getPath: () => dir },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => encryptionAvailable,
    decryptStringAsync: async () => {
      throw new Error('bad key')
    }
  },
  session: { fromPartition: () => ({ setProxy }) }
}))
vi.mock('../webContentsViewManager', () => ({ partitionForAccount: (id: string) => `persist:test-${id}` }))

const { applyAllStoredProxies, applyProxyToPartition, loadProxyConfig, ProxyConfigUnreadableError } = await import('./accountProxy')

afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => {
  setProxy.mockClear()
  encryptionAvailable = true
  writeFileSync(join(dir, 'muse-account-proxy.json'), JSON.stringify({ acc1: { enc: 'AAAA' } }))
})

describe('account proxy fails closed', () => {
  it('does not report direct when a stored proxy cannot be decrypted', async () => {
    await expect(loadProxyConfig('acc1')).rejects.toBeInstanceOf(ProxyConfigUnreadableError)
    encryptionAvailable = false
    await expect(loadProxyConfig('acc1')).rejects.toBeInstanceOf(ProxyConfigUnreadableError)
  })

  it('blocks the partition instead of going direct', async () => {
    await expect(applyProxyToPartition('acc1')).rejects.toBeInstanceOf(ProxyConfigUnreadableError)
    expect(setProxy).toHaveBeenCalledWith(expect.objectContaining({ proxyRules: 'http://127.0.0.1:9' }))
  })

  it('accounts without a proxy stay direct', async () => {
    await expect(loadProxyConfig('nobody')).resolves.toEqual({ mode: 'direct' })
  })

  it('applies every stored account at startup without throwing', async () => {
    const log = vi.fn()
    await applyAllStoredProxies(log)
    expect(setProxy).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledOnce()
  })
})
