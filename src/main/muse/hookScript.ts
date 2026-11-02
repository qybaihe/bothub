/**
 * Injected into the muse.ai page (main world) to locate Hatch `sendRequest`
 * and expose a small bridge on window.__bothubMuse.
 */
export const MUSE_HOOK_SCRIPT = String.raw`
(() => {
  if (window.__bothubMuse && window.__bothubMuse.__installed) return window.__bothubMuse.getStatus();

  const state = {
    ready: false,
    hook: 'none',
    sendRequest: null,
    path: null,
    lastError: null
  };

  function tryCandidate(fn, path) {
    if (typeof fn !== 'function') return false;
    state.sendRequest = async (method, params) => fn(method, params == null ? {} : params);
    state.ready = true;
    state.hook = 'sendRequest';
    state.path = path;
    return true;
  }

  function walk(root, path, depth, seen) {
    if (!root || depth > 5) return false;
    if (typeof root !== 'object' && typeof root !== 'function') return false;
    if (seen.has(root)) return false;
    seen.add(root);
    const keys = [];
    try { keys.push.apply(keys, Object.getOwnPropertyNames(root)); } catch (_) {}
    try { keys.push.apply(keys, Object.keys(root)); } catch (_) {}
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key || String(key).indexOf('__bothub') === 0) continue;
      let value;
      try { value = root[key]; } catch (_) { continue; }
      const next = path + '.' + key;
      if ((key === 'sendRequest' || key === 'request' || key === 'rpc') && tryCandidate(value, next)) return true;
      if (value && typeof value === 'object') {
        if (typeof value.sendRequest === 'function' && tryCandidate(value.sendRequest, next + '.sendRequest')) return true;
        if (walk(value, next, depth + 1, seen)) return true;
      }
    }
    return false;
  }

  function scanWebpack() {
    const keys = Object.keys(window);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!/webpack|chunk|__NEXT|__HATCH|__hatch|turbo/i.test(k) && k.indexOf('webpackChunk') !== 0) continue;
      try { if (walk(window[k], 'window.' + k, 0, new Set())) return true; } catch (_) {}
    }
    return false;
  }

  function scanDomAutomation() {
    state.hook = 'dom';
    state.ready = true;
    state.sendRequest = null;
    return true;
  }

  function discover() {
    try {
      if (typeof window.sendRequest === 'function' && tryCandidate(window.sendRequest, 'window.sendRequest')) return;
      if (window.hatch && tryCandidate(window.hatch.sendRequest, 'window.hatch.sendRequest')) return;
      if (window.__HATCH__ && tryCandidate(window.__HATCH__.sendRequest, 'window.__HATCH__.sendRequest')) return;
      if (scanWebpack()) return;
      scanDomAutomation();
    } catch (err) {
      state.lastError = String(err && err.message ? err.message : err);
      scanDomAutomation();
    }
  }

  window.__bothubMuse = {
    __installed: true,
    getStatus() {
      return { ready: state.ready, hook: state.hook, path: state.path, lastError: state.lastError };
    },
    rediscover() { discover(); return this.getStatus(); },
    async sendRequest(method, params) {
      if (!state.sendRequest) discover();
      if (!state.sendRequest) {
        const err = new Error('sendRequest not found; use DOM fallback');
        err.code = 'NO_SEND_REQUEST';
        throw err;
      }
      return state.sendRequest(method, params == null ? {} : params);
    },
    async domSendChat(text) {
      const editors = []
        .concat(Array.from(document.querySelectorAll('[contenteditable="true"]')))
        .concat(Array.from(document.querySelectorAll('textarea')))
        .concat(Array.from(document.querySelectorAll('[role="textbox"]')));
      const el = editors.find((e) => e.offsetParent !== null) || editors[0];
      if (!el) throw new Error('No chat composer found in muse.ai DOM');
      el.focus();
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('selectAll', false, undefined);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn =
        document.querySelector('button[data-hatch-send]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        buttons.find((b) => /send/i.test((b.getAttribute('aria-label') || '') + (b.textContent || '')));
      if (btn) btn.click();
      else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      return { ok: true, mode: 'dom' };
    }
  };

  discover();
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (state.hook === 'sendRequest' || n > 40) clearInterval(timer);
    else discover();
  }, 1000);

  return window.__bothubMuse.getStatus();
})()
`

export function museRpcScript(method: string, paramsJson: string): string {
  return `(async () => {
  if (!window.__bothubMuse) throw new Error('Muse hook not installed');
  return await window.__bothubMuse.sendRequest(${JSON.stringify(method)}, ${paramsJson});
})()`
}

export function museDomSendScript(text: string): string {
  return `(async () => {
  if (!window.__bothubMuse) throw new Error('Muse hook not installed');
  return await window.__bothubMuse.domSendChat(${JSON.stringify(text)});
})()`
}
