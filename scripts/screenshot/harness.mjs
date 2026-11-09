/**
 * Shared setup for the README screenshot and demo recording: runs the renderer
 * in a browser (`dev:web`, no Electron, no real accounts) seeded with the
 * fictional workspace from ./fixtures.mjs. The only bridge is a stub that
 * answers the Grok Bot inspector from GROK_MOCK; no platform is contacted.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { buildWorkspace, GROK_MOCK } from './fixtures.mjs'

export function loadPlaywright() {
  const req = createRequire(import.meta.url)
  for (const base of [process.cwd(), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)]) {
    try {
      return req(req.resolve('playwright', { paths: [base] }))
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found: run via `npx -y -p playwright@1.64 node scripts/screenshot/<script>.mjs`')
}

/** Starts the web renderer; resolves to a stop() function. */
export async function startWebRenderer(port) {
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
  return () => server.kill()
}

/** Fresh page with the fictional workspace, every account shown as connected. */
export async function openSeededPage(browser, { port, dark = false, viewport, deviceScaleFactor = 2, extraInit }) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
    colorScheme: dark ? 'dark' : 'light',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  })
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
    [buildWorkspace(), dark ? 'dark' : 'light']
  )
  if (extraInit) await page.addInitScript(extraInit)
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // No platform is signed in here: show the fictional accounts as connected.
  await page.evaluate(async () => {
    const { useBotStore } = await import('/src/store/botStore.ts')
    const st = useBotStore.getState()
    const accounts = Object.fromEntries(
      Object.entries(st.accounts).map(([id, a]) => [id, { ...a, status: 'online', statusDetail: undefined, pending: false }])
    )
    useBotStore.setState({ accounts })
  })
  return page
}
