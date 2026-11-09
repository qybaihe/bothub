#!/usr/bin/env node
/**
 * README screenshot: runs the renderer in a browser (`dev:web`, no Electron,
 * no real accounts) with the fictional workspace from ./fixtures.mjs.
 *
 *   npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark] [--out file.webp|.png]
 *
 * Default output: docs/assets/bothub-{light,dark}.webp (via `cwebp`, falls
 * back to .png when cwebp is missing). Uses a fresh browser profile; nothing
 * touches the app's real userData and no platform is contacted: the only
 * bridge is a stub that answers the Grok Bot inspector from GROK_MOCK.
 */
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildWorkspace, GROK_MOCK } from './fixtures.mjs'

const args = process.argv.slice(2)
const dark = args.includes('--dark')
const outIdx = args.indexOf('--out')
const out = resolve(outIdx >= 0 ? args[outIdx + 1] : `docs/assets/bothub-${dark ? 'dark' : 'light'}.webp`)
const png = out.endsWith('.webp') ? out.replace(/\.webp$/, '.capture.png') : out
const port = 5199

function loadPlaywright() {
  const req = createRequire(import.meta.url)
  for (const base of [process.cwd(), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)]) {
    try {
      return req(req.resolve('playwright', { paths: [base] }))
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found: run via `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs`')
}

const { chromium } = loadPlaywright()
const server = spawn('npx', ['vite', '--config', 'vite.web.config.mts', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('vite did not start')), 60_000)
  server.stdout.on('data', (b) => {
    if (String(b).includes(`localhost:${port}`)) {
      clearTimeout(timer)
      ok()
    }
  })
})

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1512, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
    locale: 'zh-CN'
  })
  const workspace = buildWorkspace()
  page.on('pageerror', (err) => console.warn('[page]', err.message))
  await page.addInitScript((mock) => {
    // Minimal preload stand-in: only the Grok Bot RPC, answered from fixtures.
    window.electron = {
      platform: 'web',
      grok: {
        rpc: async (req) =>
          req.op === 'call' && mock[req.method]
            ? { ok: true, status: 200, data: mock[req.method] }
            : { ok: false, status: 503, message: 'screenshot mock' }
      }
    }
  }, GROK_MOCK)
  await page.addInitScript(
    ([ws, theme]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('bothub-workspace-v1', JSON.stringify(ws))
      localStorage.setItem('bothub-prefs-v1', JSON.stringify({ state: { theme, locale: 'zh' }, version: 0 }))
    },
    [workspace, dark ? 'dark' : 'light']
  )
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // No platform is signed in here: show the fictional accounts as connected.
  await page.evaluate(async () => {
    const { useBotStore } = await import('/src/store/botStore.ts')
    const st = useBotStore.getState()
    const accounts = Object.fromEntries(
      Object.entries(st.accounts).map(([id, a]) => [
        id,
        { ...a, status: 'online', statusDetail: undefined, pending: false }
      ])
    )
    useBotStore.setState({ accounts })
  })
  await page.waitForTimeout(1500) // avatars settle, fonts load
  await page.mouse.move(1511, 1079)
  await page.screenshot({ path: png })
  await browser.close()
  if (png !== out) {
    const webp = spawnSync('cwebp', ['-quiet', '-q', '86', '-m', '6', png, '-o', out], { stdio: 'inherit' })
    if (webp.status === 0) rmSync(png)
    else console.warn(`cwebp unavailable; kept ${png}`)
  }
  console.log(`saved ${png !== out ? out : png}`)
} finally {
  server.kill()
}
