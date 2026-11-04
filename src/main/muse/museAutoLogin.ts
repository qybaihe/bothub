import { BrowserWindow } from 'electron'
import { extractLoginCodes, type MuseAutoLoginRequest, type MuseAutoLoginResult } from '@shared/museBatch'

/**
 * Drive muse.ai's own email one-time-code login inside an (unshown) login
 * window, reading the code from the account's web inbox. Never logs the
 * email address or the code. Meta "confirm you're human" checkpoints are not
 * automated: the result says `needs-human` and the window can be shown.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const EMAIL_FIELD = 'input[autocomplete~="username"], input[type="email"]'
const CODE_FIELD = 'input[autocomplete="one-time-code"], input[inputmode="numeric"][maxlength="6"]'
const CHECKPOINT_RE = /checkpoint|confirm you.?re human|确认你是真人|请确认你是|captcha/i

function clickScript(labels: RegExp): string {
  return `(() => { const re = ${labels.toString()}; const b = [...document.querySelectorAll('button,[role=button],input[type=submit]')].find((el) => re.test((el.textContent || el.value || '').trim()) && !el.disabled); if (b) { b.click(); return true } return false })()`
}

async function js<T>(win: BrowserWindow, code: string): Promise<T | undefined> {
  if (win.isDestroyed()) return undefined
  try {
    return (await win.webContents.executeJavaScript(code, true)) as T
  } catch {
    return undefined
  }
}

async function waitFor(win: BrowserWindow, code: string, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (signal.aborted || win.isDestroyed()) return false
    if (await js<boolean>(win, code)) return true
    await sleep(500)
  }
  return false
}

async function typeInto(win: BrowserWindow, selector: string, text: string): Promise<boolean> {
  const focused = await js<boolean>(
    win,
    `(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; i.focus(); i.select?.(); return true })()`
  )
  if (!focused || win.isDestroyed()) return false
  await win.webContents.insertText(text)
  return true
}

/** One hidden, in-memory window per run reads the inbox page (JS-rendered). */
export class InboxReader {
  private win: BrowserWindow | null = null
  constructor(private readonly key: string) {}

  async read(url: string): Promise<string[]> {
    if (!this.win || this.win.isDestroyed()) {
      this.win = new BrowserWindow({
        show: false,
        width: 1000,
        height: 900,
        webPreferences: { partition: `bothub-inbox-${this.key}`, sandbox: true, contextIsolation: true, backgroundThrottling: false }
      })
    }
    await this.win.loadURL(url)
    let codes: string[] = []
    for (let i = 0; i < 8; i++) {
      await sleep(750)
      const text = (await js<string>(this.win, 'document.body ? document.body.innerText : ""')) ?? ''
      codes = extractLoginCodes(text)
      if (codes.length > 0 || i >= 5) break
    }
    return codes
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}

export async function driveEmailOtpLogin(
  win: BrowserWindow,
  req: MuseAutoLoginRequest,
  opts: { signal: AbortSignal; isSignedIn: () => Promise<boolean>; codeTimeoutMs?: number }
): Promise<MuseAutoLoginResult> {
  const { signal, isSignedIn } = opts
  const cancelled = (): MuseAutoLoginResult => ({ ok: false, reason: 'cancelled' })
  const inbox = new InboxReader(req.accountId)
  try {
    if (await isSignedIn()) return { ok: true }
    if (!(await waitFor(win, `!!document.querySelector(${JSON.stringify(EMAIL_FIELD)})`, 25_000, signal))) {
      if (signal.aborted) return cancelled()
      return (await isSignedIn()) ? { ok: true } : { ok: false, reason: 'no-email-field', canShow: true }
    }

    // Codes already in the inbox are stale; only a new one counts.
    let before: string[]
    try {
      before = await inbox.read(req.inboxUrl)
    } catch {
      return { ok: false, reason: 'inbox-unreachable' }
    }
    if (signal.aborted) return cancelled()

    if (!(await typeInto(win, EMAIL_FIELD, req.email))) return { ok: false, reason: 'no-email-field', canShow: true }
    await sleep(400)
    await js(win, clickScript(/^(继续|Continue|下一步|Next)$/i))

    const codeField = `!!document.querySelector(${JSON.stringify(CODE_FIELD)})`
    if (!(await waitFor(win, codeField, 30_000, signal))) {
      if (signal.aborted) return cancelled()
      const page = `${win.isDestroyed() ? '' : win.webContents.getURL()} ${(await js<string>(win, 'document.body.innerText')) ?? ''}`
      if (CHECKPOINT_RE.test(page)) return { ok: false, reason: 'needs-human', canShow: true }
      return { ok: false, reason: 'email-rejected', canShow: true }
    }

    const seen = new Set(before)
    let code: string | undefined
    const end = Date.now() + (opts.codeTimeoutMs ?? 120_000)
    while (!code && Date.now() < end) {
      if (signal.aborted) return cancelled()
      await sleep(4_000)
      try {
        const now = await inbox.read(req.inboxUrl)
        code = now.find((c) => !seen.has(c)) ?? (now.length > before.length ? now[0] : undefined)
      } catch {
        /* transient inbox failure: keep polling until the deadline */
      }
    }
    if (!code) return { ok: false, reason: 'code-timeout', canShow: true }
    if (signal.aborted) return cancelled()

    if (!(await typeInto(win, CODE_FIELD, code))) return { ok: false, reason: 'no-code-field', canShow: true }
    code = undefined
    await sleep(500)
    await js(win, clickScript(/^(下一步|Next|继续|Continue|确认|Confirm|提交|Submit)$/i))

    const done = Date.now() + 45_000
    while (Date.now() < done) {
      if (signal.aborted) return cancelled()
      if (await isSignedIn()) return { ok: true }
      if (win.isDestroyed()) return (await isSignedIn()) ? { ok: true } : { ok: false, reason: 'timeout' }
      const url = win.webContents.getURL()
      const text = (await js<string>(win, 'document.body.innerText')) ?? ''
      if (CHECKPOINT_RE.test(url) || CHECKPOINT_RE.test(text)) return { ok: false, reason: 'needs-human', canShow: true }
      if (/(验证码|安全码|code).{0,20}(不正确|错误|无效|incorrect|invalid|wrong)/i.test(text)) {
        return { ok: false, reason: 'code-rejected', canShow: true }
      }
      await sleep(1_000)
    }
    return { ok: false, reason: 'timeout', canShow: !win.isDestroyed() }
  } finally {
    inbox.dispose()
  }
}
