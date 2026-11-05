/*
 * Runs in the ChatGPT page's MAIN world to use its same-origin session.
 * The bearer token is held only in a local function variable and is NEVER
 * passed to the content script, extension storage, or any third party.
 * This uses undocumented ChatGPT web endpoints; they may change.
 */
(() => {
  'use strict';
  if (window.__CQM_BRIDGE_V1__ || location.origin !== 'https://chatgpt.com') return;
  window.__CQM_BRIDGE_V1__ = true;

  const REQUEST = 'cqm:v1:request';
  const RESPONSE = 'cqm:v1:response';
  const fetchNative = window.fetch.bind(window);
  let ongoing = null;
  let latest = null;
  let lastSuccessfulFetch = 0;
  const MIN_REFRESH_GAP = 20000; // avoid hammering an internal endpoint
  const CREDIT_REFRESH_GAP = 10 * 60 * 1000;
  const CREDIT_ERROR_BACKOFF = 30 * 60 * 1000;
  let creditCache = null;
  let lastCreditAttempt = 0;
  let lastCreditCount = null;
  let creditBackoffUntil = 0;

  function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function clamp(value) {
    return Math.max(0, Math.min(100, value));
  }
  function findString(obj, keys, depth = 0, seen = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 6 || seen.has(obj)) return '';
    seen.add(obj);
    for (const key of keys) {
      if (typeof obj[key] === 'string' && obj[key].length) return obj[key];
    }
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value && typeof value === 'object') {
        const found = findString(value, keys, depth + 1, seen);
        if (found) return found;
      }
    }
    return '';
  }
  function accountFromToken(token) {
    try {
      const part = token.split('.')[1];
      if (!part) return '';
      const s = part.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(s.padEnd(Math.ceil(s.length / 4) * 4, '=')));
      return findString(decoded, ['chatgpt_account_id', 'chatgptAccountId', 'account_id', 'accountId']);
    } catch { return ''; }
  }
  async function getJson(path, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchNative(path, {
        method: 'GET', credentials: 'include', cache: 'no-store',
        headers: { 'Accept': 'application/json', ...headers },
        signal: controller.signal
      });
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function asMillis(raw, after) {
    const n = numeric(raw);
    if (n !== null && n > 0) return n < 1e12 ? n * 1000 : n;
    if (typeof raw === 'string') {
      const t = Date.parse(raw);
      if (Number.isFinite(t)) return t;
    }
    const seconds = numeric(after);
    return seconds === null ? null : Date.now() + seconds * 1000;
  }
  function parseWindow(value) {
    if (!value || typeof value !== 'object') return null;
    const explicitRemaining = numeric(value.remaining_percent ?? value.percent_left ?? value.remainingPercent);
    const used = numeric(value.used_percent ?? value.usedPercent);
    const remaining = explicitRemaining !== null ? clamp(explicitRemaining) :
      used !== null ? clamp(100 - used) : null;
    const lengthSeconds = numeric(value.limit_window_seconds ?? value.window_seconds ??
      value.windowDurationSeconds ?? (numeric(value.windowDurationMins) !== null ? Number(value.windowDurationMins) * 60 : null));
    const resetAt = asMillis(value.reset_time_ms ?? value.resetsAt ?? value.reset_at ?? value.resetAt,
      value.reset_after_seconds ?? value.resetAfterSeconds);
    if (remaining === null) return null;
    return { remaining, lengthSeconds, resetAt };
  }
  function extractUsage(data) {
    const rate = data?.rate_limit ?? data?.rate_limits;
    if (!rate || typeof rate !== 'object') throw new Error('errorNotRecognized');
    const slots = [
      { value: rate.primary_window ?? rate.primary, hint: null },
      { value: rate.secondary_window ?? rate.secondary, hint: null },
      { value: rate.five_hour, hint: 'fiveHour' },
      { value: rate.weekly, hint: 'weekly' }
    ];
    const windows = { fiveHour: null, weekly: null };
    for (const slot of slots) {
      const win = parseWindow(slot.value);
      if (!win) continue;
      // Label from actual reported duration: Pro may have ONLY a weekly primary.
      const type = win.lengthSeconds !== null ?
        Math.abs(win.lengthSeconds - 18000) < 180 ? 'fiveHour' :
        Math.abs(win.lengthSeconds - 604800) < 1200 ? 'weekly' : null : slot.hint;
      if (type && !windows[type]) windows[type] = { remaining: win.remaining, resetAt: win.resetAt };
    }
    if (!windows.fiveHour && !windows.weekly) throw new Error('errorNoQuota');
    const count = numeric(data?.rate_limit_reset_credits?.available_count);
    return {
      ...windows,
      resetAvailableCount: count === null ? null : Math.max(0, Math.floor(count)),
      plan: typeof data?.plan_type === 'string' ? data.plan_type.slice(0, 30) : '',
      updatedAt: Date.now()
    };
  }
  function parseCreditDetails(data, count) {
    const entries = Array.isArray(data?.credits) ? data.credits : [];
    const authoritative = numeric(data?.available_count);
    const availableCount = authoritative === null ? count : Math.max(0, Math.floor(authoritative));
    const credits = entries
      .filter(item => item && item.status === 'available')
      .map(item => ({
        title: typeof item.title === 'string' ? item.title.slice(0, 70) : '',
        expiresAt: asMillis(item.expires_at ?? item.expiresAt, null)
      }))
      .sort((a,b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity))
      .slice(0, 12);
    return { availableCount, credits, detailsAvailable: true, checkedAt: Date.now() };
  }
  async function getCreditDetails(headers, account, count) {
    const now = Date.now();
    if (count === 0) {
      creditCache = { availableCount: 0, credits: [], detailsAvailable: true, checkedAt: now };
      lastCreditCount = 0;
      return creditCache;
    }
    const refreshDue = now - lastCreditAttempt >= CREDIT_REFRESH_GAP;
    const changed = lastCreditCount !== count;
    if ((refreshDue || changed) && now >= creditBackoffUntil) {
      lastCreditAttempt = now;
      lastCreditCount = count;
      try {
        let data;
        try {
          data = await getJson('/backend-api/wham/rate-limit-reset-credits', headers);
        } catch (err) {
          if ((err.status === 401 || err.status === 403) && account && !headers['ChatGPT-Account-Id']) {
            data = await getJson('/backend-api/wham/rate-limit-reset-credits',
              { ...headers, 'ChatGPT-Account-Id': account });
          } else throw err;
        }
        creditCache = parseCreditDetails(data, count);
        creditBackoffUntil = 0;
      } catch (err) {
        creditBackoffUntil = Date.now() + (err.status === 429 ? CREDIT_ERROR_BACKOFF : CREDIT_REFRESH_GAP);
        creditCache = {
          availableCount: count, credits: [], detailsAvailable: false,
          errorCode: err.status === 429 ? 'creditRateLimited' : 'creditDetailsUnavailable',
          checkedAt: now
        };
      }
    }
    // Usage summary may update before the details endpoint. Count is the best available reading.
    return { ...creditCache, availableCount: count === null ? (creditCache?.availableCount ?? null) : count };
  }
  async function doRefresh() {
    const session = await getJson('/api/auth/session');
    const token = findString(session, ['accessToken', 'access_token']);
    if (!token) throw new Error('errorNoSession');
    const account = findString(session, ['chatgpt_account_id', 'chatgptAccountId', 'account_id', 'accountId']) || accountFromToken(token);
    const headers = { 'Authorization': `Bearer ${token}` };
    let data;
    try {
      data = await getJson('/backend-api/wham/usage', headers);
    } catch (err) {
      if ((err.status === 401 || err.status === 403) && account) {
        data = await getJson('/backend-api/wham/usage', { ...headers, 'ChatGPT-Account-Id': account });
      } else throw err;
    }
    const usage = extractUsage(data);
    const resetCredits = await getCreditDetails(headers, account, usage.resetAvailableCount);
    return { ...usage, resetCredits };
  }
  function post(requestId, payload) {
    window.postMessage({ channel: RESPONSE, requestId, payload }, location.origin);
  }
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== REQUEST) return;
    const requestId = event.data.requestId;
    if (typeof requestId !== 'string' || !/^[0-9a-z-]{1,60}$/i.test(requestId)) return;
    const now = Date.now();
    if (latest && now - lastSuccessfulFetch < MIN_REFRESH_GAP && !ongoing) {
      post(requestId, { ok: true, data: latest, cached: true });
      return;
    }
    if (!ongoing) {
      ongoing = doRefresh()
        .then(data => { latest = data; lastSuccessfulFetch = Date.now(); return { ok: true, data, cached: false }; })
        .catch(err => {
          const errorCode = err?.name === 'AbortError' ? 'errorTimeout' :
            err?.status === 429 ? 'errorTooManyRequests' :
            err?.status === 401 || err?.status === 403 ? 'errorUnauthorized' :
            ['errorNotRecognized', 'errorNoQuota', 'errorNoSession'].includes(err?.message) ? err.message :
            err?.status ? 'errorHttp' : 'errorUnknown';
          return { ok: false, errorCode, httpStatus: err?.status || null };
        })
        .finally(() => { ongoing = null; });
    }
    post(requestId, await ongoing);
  });
})();
