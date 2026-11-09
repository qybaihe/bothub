import { BrowserWindow } from 'electron'
import {
  extractLoginCodes,
  pickFreshCode,
  type MuseAutoLoginRequest,
  type MuseAutoLoginResult
} from '@shared/museBatch'

/**
 * Drive muse.ai's own email one-time-code login inside an (unshown) login
 * window, reading the code from the account's web inbox. Never logs the
 * email address or the code. Meta "confirm you're human" checkpoints are not
 * automated: the result says `needs-human` and the window can be shown.
 */

const EMAIL_FIELD = 'input[autocomplete~="username"], input[type="email"]'
const CODE_FIELD = 'input[autocomplete="one-time-code"], input[inputmode="numeric"][maxlength="6"]'
const CHECKPOINT_RE = /checkpoint|confirm you.?re human|确认你是真人|请确认你是|captcha/i
const CONTINUE_RE = /^(继续|Continue|下一步|Next)$/i
const SUBMIT_RE = /^(下一步|Next|继续|Continue|确认|Confirm|提交|Submit)$/i
const RESEND_RE = /^(重新发送(验证码)?|Resend( code)?|Send (a )?new code|发送新验证码)$/i
const INBOX_LOAD_TIMEOUT_MS = 20_000
const INBOX_PARTITION = 'bothub-inbox'

class Aborted extends Error {}

/** Sleep that wakes up early (and throws) when the run is cancelled. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Aborted())
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Aborted())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function clickScript(labels: RegExp): string {
  return `(() => { const re = ${labels.toString()}; const b = [...document.querySelectorAll('button,[role=button],input[type=submit]')].find((el) => re.test((el.textContent || el.value || '').trim()) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'); if (b) { b.click(); return true } return false })()`
}

/** Submit the form that owns `selector` when no labelled button matched. */
function submitScript(selector: string): string {
  return `(() => { const i = document.querySelector(${JSON.stringify(selector)}); const f = i && i.form; if (f && f.requestSubmit) { f.requestSubmit(); return true } return false })()`
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
    await sleep(500, signal).catch(() => undefined)
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

/** Click the labelled button; fall back to submitting the form, then Enter. */
async function submit(win: BrowserWindow, labels: RegExp, fieldSelector: string): Promise<void> {
  if (await js<boolean>(win, clickScript(labels))) return
  if (await js<boolean>(win, submitScript(fieldSelector))) return
  if (win.isDestroyed()) return
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
}

async function pageText(win: BrowserWindow): Promise<string> {
  if (win.isDestroyed()) return ''
  return `${win.webContents.getURL()} ${(await js<string>(win, 'document.body ? document.body.innerText : ""')) ?? ''}`
}

/** One hidden, in-memory window per run reads the inbox page (JS-rendered). */
export class InboxReader {
  private win: BrowserWindow | null = null

  async read(url: string, signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) throw new Aborted()
    if (!this.win || this.win.isDestroyed()) {
      this.win = new BrowserWindow({
        show: false,
        width: 1000,
        height: 900,
        // Shared in-memory partition: one per run leaked a session each time.
        webPreferences: { partition: INBOX_PARTITION, sandbox: true, contextIsolation: true, backgroundThrottling: false }
      })
    }
    const win = this.win
    const load = win.loadURL(url).catch((error: unknown) => {
      // Redirects/hash changes abort the first navigation (ERR_ABORTED, -3);
      // the page still renders, so read it anyway.
      const code = (error as { errno?: number })?.errno
      if (code !== -3) throw error
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('inbox load timeout')), INBOX_LOAD_TIMEOUT_MS)
    })
    const aborted = new Promise<never>((_, reject) => {
      signal?.addEventListener('abort', () => reject(new Aborted()), { once: true })
    })
    try {
      await Promise.race([load, timeout, aborted])
    } catch (error) {
      if (!win.isDestroyed()) win.webContents.stop()
      throw error
    } finally {
      clearTimeout(timer)
    }
    let codes: string[] = []
    for (let i = 0; i < 8; i++) {
      await sleep(750, signal)
      const text = (await js<string>(win, 'document.body ? document.body.innerText : ""')) ?? ''
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

/**
 * Codes already in the inbox are stale. Read the baseline a few times (the
 * first load is often empty or an interstitial) and keep every code seen.
 */
async function readBaseline(inbox: InboxReader, url: string, signal: AbortSignal): Promise<string[] | null> {
  const seen = new Set<string>()
  let ok = 0
  for (let attempt = 0; attempt < 3 && ok < 2; attempt++) {
    try {
      for (const c of await inbox.read(url, signal)) seen.add(c)
      ok++
    } catch (error) {
      if (error instanceof Aborted) throw error
    }
    if (ok < 2) await sleep(1_500 * (attempt + 1), signal)
  }
  return ok > 0 ? [...seen] : null
}

export async function driveEmailOtpLogin(
  win: BrowserWindow,
  req: MuseAutoLoginRequest,
  opts: { signal: AbortSignal; isSignedIn: () => Promise<boolean>; codeTimeoutMs?: number }
): Promise<MuseAutoLoginResult> {
  const { signal, isSignedIn } = opts
  const inbox = new InboxReader()
  // Cancel must not wait for a hanging inbox page.
  const onAbort = () => inbox.dispose()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    if (await isSignedIn()) return { ok: true }
    if (!(await waitFor(win, `!!document.querySelector(${JSON.stringify(EMAIL_FIELD)})`, 25_000, signal))) {
      if (signal.aborted) throw new Aborted()
      if (await isSignedIn()) return { ok: true }
      if (CHECKPOINT_RE.test(await pageText(win))) return { ok: false, reason: 'needs-human', canShow: true }
      return { ok: false, reason: 'no-email-field', canShow: true }
    }

    const before = await readBaseline(inbox, req.inboxUrl, signal)
    if (!before) return { ok: false, reason: 'inbox-unreachable' }

    if (!(await typeInto(win, EMAIL_FIELD, req.email))) return { ok: false, reason: 'no-email-field', canShow: true }
    await sleep(400, signal)
    await submit(win, CONTINUE_RE, EMAIL_FIELD)

    const codeField = `!!document.querySelector(${JSON.stringify(CODE_FIELD)})`
    if (!(await waitFor(win, codeField, 30_000, signal))) {
      if (signal.aborted) throw new Aborted()
      if (CHECKPOINT_RE.test(await pageText(win))) return { ok: false, reason: 'needs-human', canShow: true }
      return { ok: false, reason: 'email-rejected', canShow: true }
    }

    let code: string | undefined
    const timeoutMs = opts.codeTimeoutMs ?? 120_000
    const started = Date.now()
    let resent = false
    while (!code && Date.now() - started < timeoutMs) {
      await sleep(4_000, signal)
      try {
        code = pickFreshCode(before, await inbox.read(req.inboxUrl, signal))
      } catch (error) {
        if (error instanceof Aborted) throw error
        /* transient inbox failure: keep polling until the deadline */
      }
      // Halfway with nothing new: ask Muse once for another code.
      if (!code && !resent && Date.now() - started > timeoutMs / 2) {
        resent = true
        await js(win, clickScript(RESEND_RE))
      }
    }
    if (!code) return { ok: false, reason: 'code-timeout', canShow: true }

    if (!(await typeInto(win, CODE_FIELD, code))) return { ok: false, reason: 'no-code-field', canShow: true }
    code = undefined
    await sleep(500, signal)
    await submit(win, SUBMIT_RE, CODE_FIELD)

    const done = Date.now() + 45_000
    while (Date.now() < done) {
      if (await isSignedIn()) return { ok: true }
      if (win.isDestroyed()) return (await isSignedIn()) ? { ok: true } : { ok: false, reason: 'timeout' }
      const text = await pageText(win)
      if (CHECKPOINT_RE.test(text)) return { ok: false, reason: 'needs-human', canShow: true }
      if (/(验证码|安全码|code).{0,20}(不正确|错误|无效|incorrect|invalid|wrong)/i.test(text)) {
        return { ok: false, reason: 'code-rejected', canShow: true }
      }
      await sleep(1_000, signal)
    }
    return { ok: false, reason: 'timeout', canShow: !win.isDestroyed() }
  } catch (error) {
    if (error instanceof Aborted || signal.aborted) return { ok: false, reason: 'cancelled' }
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    inbox.dispose()
  }
}
