#!/usr/bin/env node
/**
 * README screenshot of the fictional workspace (see ./harness.mjs).
 *
 *   npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark] [--out file.webp|.png]
 *
 * Default output: docs/assets/bothub-{light,dark}.webp (via `cwebp`, falls
 * back to .png when cwebp is missing). Uses a fresh browser profile; nothing
 * touches the app's real userData.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadPlaywright, openSeededPage, startWebRenderer } from './harness.mjs'

const args = process.argv.slice(2)
const dark = args.includes('--dark')
const outIdx = args.indexOf('--out')
const out = resolve(outIdx >= 0 ? args[outIdx + 1] : `docs/assets/bothub-${dark ? 'dark' : 'light'}.webp`)
const png = out.endsWith('.webp') ? out.replace(/\.webp$/, '.capture.png') : out
const port = 5199

const { chromium } = loadPlaywright()
const stop = await startWebRenderer(port)
try {
  const browser = await chromium.launch()
  const page = await openSeededPage(browser, { port, dark, viewport: { width: 1512, height: 1080 } })
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
  stop()
}
