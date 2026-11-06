/** The custom HTML is a trusted, same-origin srcdoc page. The Dodo SDK
 * remains available for convenient AV operations, but it is NOT a security
 * boundary: user-authored scripts can also access the host origin.
 */
const BOOTSTRAP = `
(() => {
  const requests = new Map();
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'dodoCustomRefresh') {
      window.dispatchEvent(new Event('dodoDBRefresh'));
      return;
    }
    if (data.type !== 'dodoCustomResult' || !requests.has(data.requestId)) return;
    const pending = requests.get(data.requestId);
    requests.delete(data.requestId);
    clearTimeout(pending.timer);
    if (data.error) pending.reject(new Error(String(data.error)));
    else pending.resolve(data.result);
  });
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    const requestId = (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID() : 'rpc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const timer = setTimeout(() => {
      requests.delete(requestId);
      reject(new Error('数据库请求超时'));
    }, 30000);
    requests.set(requestId, { resolve, reject, timer });
    window.parent.postMessage({ type: 'dodoCustomRequest', requestId, method, args }, '*');
  });
  // Keep Dodo deep-link navigation routed through the AV record opener.
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const element = event.target instanceof Element ? event.target : null;
    const anchor = element?.closest('a[href]');
    const href = anchor?.getAttribute('href')?.trim() || '';
    const prefix = 'siyuan:' + '/' + '/' + 'blocks' + '/';
    if (!href.toLowerCase().startsWith(prefix)) return;
    const blockId = href.slice(prefix.length).split('?')[0].split('#')[0].split('/')[0];
    if (!/^[0-9]{14}-[a-z0-9]{7}$/.test(blockId)) return;
    event.preventDefault();
    event.stopPropagation();
    void call('openRecord', { recordId: blockId }).catch(error => {
      const notice = document.createElement('div');
      notice.setAttribute('role', 'alert');
      notice.textContent = '无法打开思源记录：' + (error?.message || String(error));
      notice.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;max-width:min(420px,90vw);padding:12px 16px;border-radius:8px;background:#8c2833;color:white;font:13px/1.5 system-ui;box-shadow:0 3px 12px #0004';
      (document.body || document.documentElement).append(notice);
      setTimeout(() => notice.remove(), 6000);
    });
  }, true);
  // One Dodo-managed cursor per custom HTML iframe. The native AV view's
  // pageSize determines every fetch, regardless of caller-supplied sizes.
  // Dedup, in-flight sharing, refresh invalidation and stale-response checks
  // all live here instead of being reimplemented by each Agent-written page.
  let sharedPager = null;
  function createManagedPaginator() {
    let generation = 0, nextPage = 1, total = 0, nativeSize = 0, chunk = 0;
    let rows = [], ids = new Set(), complete = false, initialized = false;
    let inFlight = null;
    const snapshot = (added = [], stale = false) => ({
      records: rows.slice(), added, total, page: nextPage - 1,
      pageSize: nativeSize, batchSize: chunk, all: nativeSize >= 102400,
      hasMore: !complete, stale
    });
    const reset = () => {
      generation++; nextPage = 1; total = 0; nativeSize = 0; chunk = 0;
      rows = []; ids = new Set(); complete = false; initialized = false;
      inFlight = null;
    };
    const next = () => {
      if (inFlight) return inFlight;
      if (complete) return Promise.resolve(snapshot());
      const token = generation, page = nextPage;
      const pending = call('listRecords', {page}).then(data => {
        if (token !== generation) return snapshot([], true);
        if (initialized && (data.nativePageSize !== nativeSize ||
            data.pageSize !== chunk)) {
          reset();
          throw new Error('思源视图条目数已改变，请重新加载数据');
        }
        initialized = true;
        nativeSize = data.nativePageSize;
        chunk = data.pageSize;
        total = data.total;
        const added = [];
        for (const row of data.records || []) {
          if (!row || typeof row.id !== 'string' || ids.has(row.id)) continue;
          ids.add(row.id);
          rows.push(row);
          added.push(row);
        }
        nextPage = page + 1;
        complete = !data.hasMore || !(data.records || []).length ||
          (total > 0 && ids.size >= total);
        return snapshot(added);
      }).finally(() => {
        if (inFlight === pending) inFlight = null;
      });
      inFlight = pending;
      return pending;
    };
    return Object.freeze({
      next, reset,
      get records() { return rows.slice(); },
      get pageSize() { return nativeSize; },
      get batchSize() { return chunk; },
      get total() { return total; },
      get hasMore() { return !complete; }
    });
  }
  const getPaginator = () => sharedPager || (sharedPager = createManagedPaginator());
  window.addEventListener('dodoDBRefresh', () => { if (sharedPager) sharedPager.reset(); });
  Object.defineProperty(window, 'dodoDB', {
    value: Object.freeze({
      getSchema: () => call('getSchema'),
      listRecords: options => call('listRecords', options),
      createPaginator: getPaginator,
      openRecord: recordId => call('openRecord', { recordId }),
      updateCell: change => call('updateCell', change),
      createRecord: values => call('createRecord', { values }),
    }), configurable: false, writable: false
  });
  window.dispatchEvent(new Event('dodoDBReady'));
})();
`;

/** SiYuan's own bundled ECharts; already used by Dodo's native chart iframe.
 * Do not whitelist an entire host, scripts directory, or external CDN. */
export const SIYUAN_ECHARTS_PATH = "/stage/protyle/js/echarts/echarts.min.js";

/** Existing Agent-authored charts should work without changing their HTML.
 * A meta marker also supports scripts that reference the library indirectly:
 * <meta name="dodo-echarts" content="enabled">.
 * Non-chart pages avoid paying the cost of loading the full chart engine. */
export function needsECharts(source: string): boolean {
  return /\b(?:window\s*\.\s*)?echarts\s*(?:\?|\.|\[)/.test(source) ||
    /<meta\b[^>]*\bname\s*=\s*(["'])dodo-echarts\1[^>]*>/i.test(source);
}

/**
 * Default custom HTML scrollbar, matching Dodo's existing narrow gallery
 * scrollbar. :where(*) has zero specificity so an App's own CSS can override.
 * This doesn't change persisted user HTML or SiYuan's outer scrollbar.
 */
export const CUSTOM_SCROLLBAR_STYLE = `<style id="dodo-custom-scrollbar">
:where(*) {
  scrollbar-width: thin;
  scrollbar-color: rgba(127, 127, 127, 0.58) transparent;
}
:where(*)::-webkit-scrollbar {
  width: 6px;
  height: 6px;
  background: transparent;
}
:where(*)::-webkit-scrollbar-track,
:where(*)::-webkit-scrollbar-corner {
  background: transparent;
}
:where(*)::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
:where(*)::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
  background-color: rgba(127, 127, 127, 0.58);
}
:where(*)::-webkit-scrollbar-thumb:hover {
  background-color: rgba(127, 127, 127, 0.78);
}
</style>`;

/** No sandbox or injected CSP: srcdoc shares the SiYuan origin and can load
 * assets/... URLs directly. The root base makes relative asset URLs work
 * regardless of the current SiYuan document or window location.
 * Only use with HTML whose scripts the user trusts.
 */
export function customViewSrcdoc(source: string): string {
  const useCharts = needsECharts(source);
  const library = useCharts
    ? `<script src="${SIYUAN_ECHARTS_PATH}"></script>`
    : "";
  const meta = `<base href="/">${CUSTOM_SCROLLBAR_STYLE}<script>${BOOTSTRAP}</script>${library}`;
  if (/<head(?:\s[^>]*)?>/i.test(source)) {
    return source.replace(/<head(?:\s[^>]*)?>/i, header => header + meta);
  }
  return '<!doctype html><html><head>' + meta + '</head><body>' + source + '</body></html>';
}
