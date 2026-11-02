import { shell, WebContentsView, type BrowserWindow, type Rectangle } from 'electron'
import type { CreateWebViewRequest, WebViewBounds, WebViewInfo } from '@shared/ipc'

/**
 * Manages embedded platform web sessions for one window.
 *
 * Each bot + account pair gets its own WebContentsView. Views are created
 * hidden; the renderer attaches one at a time over a placeholder region and
 * keeps its bounds in sync. Every account gets its own persistent session
 * partition, so multiple logins on the same platform never share cookies.
 *
 * Stub: today it loads a local placeholder page (or a caller-provided http(s)
 * URL). Platform automation/protocol work will build on top of this.
 */

interface ManagedView {
  info: Omit<WebViewInfo, 'attached'>
  view: WebContentsView
}

export function webViewId(botId: string, accountId: string): string {
  return `${botId}::${accountId}`
}

export function partitionForAccount(accountId: string): string {
  return `persist:bothub-account-${accountId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function placeholderPage(label: string, partition: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(label)}</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#fafafb;color:#4a4a56;
       font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  .card{max-width:380px;padding:28px 32px;text-align:center;background:#fff;border:1px solid #ebebef;
        border-radius:16px;box-shadow:0 6px 16px -6px rgb(23 23 28 / .08)}
  h1{margin:12px 0 6px;font-size:15px;color:#17171c}
  code{font:11px ui-monospace,Menlo,monospace;background:#f1f1f4;padding:2px 6px;border-radius:6px}
  .glyph{width:44px;height:44px;margin:0 auto;display:grid;place-items:center;border-radius:12px;
         background:#f4f4ff;color:#5f56df;font-weight:600;font-size:18px}
</style></head><body><div class="card">
  <div class="glyph">◎</div>
  <h1>${escapeHtml(label)}</h1>
  <p>This is an embedded WebContentsView running in its own session partition <code>${escapeHtml(partition)}</code>.</p>
  <p>The platform's web app will load here once protocol integration lands.</p>
</div></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function toRectangle(bounds: WebViewBounds): Rectangle {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  }
}

export class WebContentsViewManager {
  private readonly views = new Map<string, ManagedView>()
  private attachedId: string | null = null

  constructor(private readonly window: BrowserWindow) {
    // A renderer reload must not leave a native view floating over the new page.
    window.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.detachAll()
    })
    window.on('closed', () => this.destroyAll())
  }

  create(request: CreateWebViewRequest): WebViewInfo {
    const viewId = webViewId(request.botId, request.accountId)
    const existing = this.views.get(viewId)
    if (existing) return this.describe(existing)

    if (request.url !== undefined && !isHttpUrl(request.url)) {
      throw new Error(`Refusing to load non-http(s) URL: ${request.url}`)
    }

    const partition = partitionForAccount(request.accountId)
    const view = new WebContentsView({
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    view.setBackgroundColor('#ffffff')

    // Popups open in the user's browser; the embedded page never spawns windows.
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    view.webContents.on('will-navigate', (event, url) => {
      if (!isHttpUrl(url)) event.preventDefault()
    })

    const url = request.url ?? placeholderPage(request.label ?? 'Web session', partition)
    void view.webContents.loadURL(url).catch((error: unknown) => {
      console.error(`[web-view ${viewId}] failed to load`, error)
    })

    const managed: ManagedView = {
      info: { viewId, botId: request.botId, accountId: request.accountId, partition, url: request.url ?? 'about:placeholder' },
      view
    }
    this.views.set(viewId, managed)
    return this.describe(managed)
  }

  attach(viewId: string, bounds: WebViewBounds): WebViewInfo {
    const managed = this.require(viewId)
    if (this.attachedId && this.attachedId !== viewId) this.detach(this.attachedId)
    if (this.attachedId !== viewId) {
      this.window.contentView.addChildView(managed.view)
      this.attachedId = viewId
    }
    managed.view.setBounds(toRectangle(bounds))
    return this.describe(managed)
  }

  resize(viewId: string, bounds: WebViewBounds): void {
    if (this.attachedId !== viewId) return
    this.views.get(viewId)?.view.setBounds(toRectangle(bounds))
  }

  detach(viewId: string): void {
    const managed = this.views.get(viewId)
    if (!managed || this.attachedId !== viewId) return
    this.window.contentView.removeChildView(managed.view)
    this.attachedId = null
  }

  detachAll(): void {
    if (this.attachedId) this.detach(this.attachedId)
  }

  destroy(viewId: string): void {
    const managed = this.views.get(viewId)
    if (!managed) return
    if (!this.window.isDestroyed()) this.detach(viewId)
    this.views.delete(viewId)
    if (!managed.view.webContents.isDestroyed()) managed.view.webContents.close()
  }

  /** Return the native view for advanced integrations (e.g. Muse RPC). */
  getView(viewId: string): WebContentsView | undefined {
    return this.views.get(viewId)?.view
  }

  destroyAll(): void {
    for (const viewId of [...this.views.keys()]) this.destroy(viewId)
    this.attachedId = null
  }

  list(): WebViewInfo[] {
    return [...this.views.values()].map((managed) => this.describe(managed))
  }

  private require(viewId: string): ManagedView {
    const managed = this.views.get(viewId)
    if (!managed) throw new Error(`Unknown web view: ${viewId}`)
    return managed
  }

  private describe(managed: ManagedView): WebViewInfo {
    return { ...managed.info, attached: this.attachedId === managed.info.viewId }
  }
}
