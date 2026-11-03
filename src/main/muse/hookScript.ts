/**
 * Injected into the muse.ai page (main world) to locate Hatch `sendRequest`
 * and expose a small bridge on window.__bothubMuse.
 *
 * Discovery order:
 * 1. Well-known globals (window.sendRequest / hatch / __HATCH__)
 * 2. React fiber props (Hatch puts sendRequest on context/providers)
 * 3. Light webpack/global walk
 * 4. DOM composer fallback for chat.stream only
 */
export const MUSE_HOOK_SCRIPT = String.raw`
(() => {
  const state = (window.__bothubMuse && window.__bothubMuse.__state) || {
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
    state.lastError = null;
    return true;
  }

  function scanReactFiber() {
    try {
      const rootEl = document.querySelector('#__next') || document.body;
      if (!rootEl) return false;
      const fiberKey = Object.keys(rootEl).find(function (k) {
        return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactContainer') === 0;
      });
      if (!fiberKey) return false;
      const queue = [rootEl[fiberKey]];
      const seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      let checked = 0;
      while (queue.length && checked < 25000) {
        const fiber = queue.shift();
        if (!fiber) continue;
        if (seen) {
          if (seen.has(fiber)) continue;
          seen.add(fiber);
        }
        checked += 1;
        const props = fiber.memoizedProps;
        if (props && typeof props === 'object') {
          if (typeof props.sendRequest === 'function' && tryCandidate(props.sendRequest, 'reactFiber.props.sendRequest')) return true;
          if (props.value && typeof props.value.sendRequest === 'function' && tryCandidate(props.value.sendRequest, 'reactFiber.props.value.sendRequest')) return true;
          if (props.gateway && typeof props.gateway.sendRequest === 'function' && tryCandidate(props.gateway.sendRequest, 'reactFiber.props.gateway.sendRequest')) return true;
        }
        if (fiber.child) queue.push(fiber.child);
        if (fiber.sibling) queue.push(fiber.sibling);
      }
    } catch (err) {
      state.lastError = String(err && err.message ? err.message : err);
    }
    return false;
  }

  function walk(root, path, depth, seen) {
    if (!root || depth > 4) return false;
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
    if (state.hook === 'sendRequest' && state.sendRequest) return true;
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
      if (scanReactFiber()) return;
      if (scanWebpack()) return;
      scanDomAutomation();
    } catch (err) {
      state.lastError = String(err && err.message ? err.message : err);
      scanDomAutomation();
    }
  }

  window.__bothubMuse = {
    __installed: true,
    __state: state,
    getStatus() {
      return { ready: state.ready, hook: state.hook, path: state.path, lastError: state.lastError };
    },
    rediscover() { discover(); return this.getStatus(); },
    async sendRequest(method, params) {
      if (!state.sendRequest || state.hook !== 'sendRequest') discover();
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
        buttons.find((b) => /send|发送/i.test((b.getAttribute('aria-label') || '') + (b.textContent || '')));
      if (btn) btn.click();
      else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      const before = (document.body && document.body.innerText) ? document.body.innerText.length : 0;
      let reply = '';
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const pageText = (document.body && document.body.innerText) ? document.body.innerText : '';
        if (pageText.length > before + 20) {
          reply = pageText.slice(-1200);
          break;
        }
      }
      return { ok: true, mode: 'dom', reply };
    }
  };

  // Always rediscover: gateway may come up after first paint, and an early
  // "dom" result must not permanently block sendRequest.
  discover();
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (state.hook === 'sendRequest' || n > 60) clearInterval(timer);
    else discover();
  }, 1000);

  return window.__bothubMuse.getStatus();
})()
`

export function museRpcScript(method: string, paramsJson: string): string {
  return `(async () => {
  if (!window.__bothubMuse) throw new Error('Muse hook not installed');
  if (window.__bothubMuse.rediscover) window.__bothubMuse.rediscover();
  return await window.__bothubMuse.sendRequest(${JSON.stringify(method)}, ${paramsJson});
})()`
}

export function museDomSendScript(text: string): string {
  return `(async () => {
  if (!window.__bothubMuse) throw new Error('Muse hook not installed');
  return await window.__bothubMuse.domSendChat(${JSON.stringify(text)});
})()`
}
