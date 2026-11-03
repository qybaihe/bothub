import type { WebContents } from 'electron'

/**
 * muse.ai streams its SSR shell and reveals Suspense boundaries ($RC/$RV)
 * inside requestAnimationFrame. A WebContentsView that is not attached to the
 * window reports visibilityState=hidden, so rAF never fires: the page stays
 * blank, React never hydrates, and the gateway client (sendRequest) never
 * boots. Keep the page "visible + focused + active" via CDP so it behaves like
 * a foreground tab even when BotHub shows a different panel.
 */
export async function applyMuseKeepAlive(wc: WebContents): Promise<boolean> {
  if (wc.isDestroyed()) return false
  const dbg = wc.debugger
  try {
    if (!dbg.isAttached()) dbg.attach('1.3')
  } catch (error) {
    console.warn('[muse] keepalive debugger attach failed', error)
    return false
  }
  try {
    await dbg.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    await dbg.sendCommand('Page.enable')
    await dbg.sendCommand('Page.setWebLifecycleState', { state: 'active' })
    return true
  } catch (error) {
    console.warn('[muse] keepalive command failed', error)
    return false
  }
}

/** Page-side probe + nudges (runs in the muse.ai main world). */
export const MUSE_HEALTH_SCRIPT = String.raw`(() => {
  const init = window.__HATCH_GATEWAY_INIT__ || null;
  // Flush React streaming reveals that may have queued while hidden.
  let flushed = 0;
  try {
    if (Array.isArray(window.$RB) && window.$RB.length && typeof window.$RV === 'function') {
      flushed = window.$RB.length;
      window.$RV(window.$RB.splice(0));
    }
  } catch (e) {}
  const text = (document.body && document.body.innerText) || '';
  return {
    visibility: document.visibilityState,
    bodyLen: text.length,
    store: !!window.__hatch_store__,
    loginUi: /登录或创建|Log in or create/i.test(text),
    vmId: init && init.vmName ? String(init.vmName) : null,
    flushed
  };
})()`

/** Same call the official client makes in HatchVmWakeRecovery. */
export function museWakeScript(vmId: string, retryCount: number): string {
  return String.raw`(async () => {
    try {
      const r = await fetch('/api/hatch/vm/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ vm_id: ${JSON.stringify(vmId)}, retry_count: ${retryCount} })
      });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e) { return { status: 0, body: String(e && e.message || e) }; }
  })()`
}
