#!/usr/bin/env node
/**
 * README demo animation: a scripted walk through the fictional workspace
 * (see ./harness.mjs) recorded with the Chrome DevTools screencast and turned
 * into a GIF (README) and an MP4 with ffmpeg.
 *
 *   npx -y -p playwright@1.64 node scripts/screenshot/record.mjs [--out docs/assets/bothub-demo]
 *
 * Needs ffmpeg; uses gifsicle when available. Sending is simulated in the
 * page (the Grok Bot adapter's sendMessage is replaced), so nothing leaves the
 * machine. Frames go to a temp dir that is removed afterwards.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadPlaywright, openSeededPage, startWebRenderer } from './harness.mjs'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outBase = resolve(outIdx >= 0 ? args[outIdx + 1] : 'docs/assets/bothub-demo')
const port = 5198
const W = 1440
const H = 900
const FPS = 15

const USER_TEXT = '顺便检查一下发布流程，有风险的地方告诉我。'
const REPLY = [
  '看了一遍 `release.yml`，有两处风险：',
  '',
  '1. **macOS 公证**：缺少凭据时会静默跳过，建议直接失败。',
  '2. **Windows 签名**：证书 12 月 3 日到期，记得提前续期。',
  '',
  '其余步骤没问题，修复已经推到 PR 里了。'
].join('\n')

// Fake pointer: headless Chromium does not draw one.
function installCursor() {
  const add = () => {
    const el = document.createElement('div')
    el.id = '__demo_cursor'
    el.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3L16 20l-2.6 1.2-3.2-7.1L5 18.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'translate(-100px,-100px)',
      transition: 'scale 120ms ease',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.25))'
    })
    document.body.appendChild(el)
    addEventListener('mousemove', (e) => (el.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`), true)
    addEventListener('mousedown', () => (el.style.scale = '0.85'), true)
    addEventListener('mouseup', () => (el.style.scale = '1'), true)
  }
  if (document.body) add()
  else addEventListener('DOMContentLoaded', add)
}

const { chromium } = loadPlaywright()
const stop = await startWebRenderer(port)
const work = mkdtempSync(join(tmpdir(), 'bothub-demo-'))
try {
  const browser = await chromium.launch()
  const page = await openSeededPage(browser, {
    port,
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    extraInit: installCursor
  })

  // Start on Muse-日程助理 with the inspector closed; simulate Grok Bot sending.
  await page.evaluate(
    async ([reply]) => {
      const { useBotStore } = await import('/src/store/botStore.ts')
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => n.includes('/adapters/registry.ts'))
      const { adapterRegistry } = await import(url)
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const grok = adapterRegistry.get('grok')
      grok.sendMessage = async (m) => {
        const st = () => useBotStore.getState()
        await sleep(700)
        m.onAccepted?.()
        st().setActivity(m.accountId, { code: 'thinking', text: '正在检查发布流程…', emoji: null, busy: true })
        st().setTyping(m.conversationId, true)
        await sleep(1000)
        let out = ''
        for (let i = 0; i < reply.length; i += 3) {
          out = reply.slice(0, i + 3)
          st().applyMessageDelta('demo-reply', m.conversationId, m.accountId, out)
          await sleep(45)
        }
        st().setTyping(m.conversationId, false)
        st().setActivity(m.accountId, null)
        return { messageId: 'demo-sent', acceptedAt: Date.now() }
      }
      useBotStore.setState({ infoPanelOpen: false })
      useBotStore.getState().selectBot('b-plan')
    },
    [REPLY]
  )
  await page.mouse.move(W * 0.55, H * 0.6)
  await page.waitForTimeout(1500)

  let pos = { x: W * 0.55, y: H * 0.6 }
  const glide = async (x, y, ms = 700) => {
    const from = pos
    const start = Date.now()
    for (let t = 0; t < 1; ) {
      t = Math.min(1, (Date.now() - start) / ms) // wall-clock based: steady speed
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      await page.waitForTimeout(12)
    }
    pos = { x, y }
  }
  const centerOf = async (locator, dx = 0.35) => {
    const box = await locator.boundingBox()
    if (!box) throw new Error(`not visible: ${locator}`)
    return [box.x + box.width * dx, box.y + box.height / 2]
  }
  const click = async () => {
    await page.mouse.down()
    await page.waitForTimeout(90)
    await page.mouse.up()
  }
  const row = (name) => page.locator('[data-bot-row]', { hasText: name }).first()

  // Screencast: frames arrive whenever the page repaints.
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ ts: metadata.timestamp, data })
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H })
  await page.waitForTimeout(800)

  // 1. Browse a few bots.
  await glide(...(await centerOf(row('Dot-邮件管家'))), 800)
  await page.waitForTimeout(250)
  await click()
  await page.waitForTimeout(1300)
  await glide(...(await centerOf(row('Grok-代码审查'))), 850)
  await page.waitForTimeout(250)
  await click()
  await page.waitForTimeout(1000)

  // 2. Type and send a message; the reply streams in.
  const composer = page.locator('textarea').first()
  await glide(...(await centerOf(composer, 0.3)), 800)
  await click()
  await page.waitForTimeout(250)
  for (const ch of USER_TEXT) {
    await page.keyboard.insertText(ch)
    await page.waitForTimeout(55 + Math.random() * 40)
  }
  await page.waitForTimeout(450)
  await page.keyboard.press('Enter')
  await glide(pos.x + 120, pos.y - 140, 600)
  await page.waitForFunction(
    async () => {
      const { useBotStore } = await import('/src/store/botStore.ts')
      return !useBotStore.getState().typing['b-review'] && useBotStore.getState().messages['b-review'].some((m) => m.id === 'demo-reply')
    },
    null,
    { timeout: 20_000, polling: 100 }
  )
  await page.waitForTimeout(1100)

  // 3. Peek at the inspector: scheduled tasks, then memories.
  const toggle = page.getByRole('button', { name: '显示详情' })
  await glide(...(await centerOf(toggle, 0.5)), 800)
  await page.waitForTimeout(350)
  await click()
  await page.waitForTimeout(900)
  const task = page.getByText('每日 PR 巡检').first()
  await glide(...(await centerOf(task, 0.6)), 700)
  await page.waitForTimeout(900)
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 22)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(1500)

  await cdp.send('Page.stopScreencast')
  await browser.close()

  // Frames -> constant-rate video. Each frame lasts until the next one.
  const list = []
  frames.forEach((f, i) => {
    const file = join(work, `f${String(i).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    const next = frames[i + 1]?.ts ?? f.ts + 0.6
    list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`)
  })
  list.push(`file '${join(work, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`)
  writeFileSync(join(work, 'list.txt'), list.join('\n'))
  const duration = frames.at(-1).ts + 0.6 - frames[0].ts

  const ff = (...a) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${a.join(' ')}`)
  }
  const input = ['-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt')]
  ff(...input, '-vf', `fps=30,format=yuv420p`, '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', `${outBase}.mp4`)
  const gif = `${outBase}.gif`
  ff(
    ...input,
    '-filter_complex',
    `fps=${FPS},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop',
    '0',
    gif
  )
  if (spawnSync('gifsicle', ['--version']).status === 0) {
    spawnSync('gifsicle', ['-b', '-O3', '--lossy=30', gif], { stdio: 'inherit' })
  }
  const mb = (p) => (statSync(p).size / 1e6).toFixed(2)
  console.log(`${frames.length} frames, ${duration.toFixed(1)}s -> ${gif} (${mb(gif)} MB), ${outBase}.mp4 (${mb(`${outBase}.mp4`)} MB)`)
} finally {
  rmSync(work, { recursive: true, force: true })
  stop()
}
