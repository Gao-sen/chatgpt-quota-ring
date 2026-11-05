/* Minimal single quota ring for ChatGPT (ISOLATED world).
 * The UI never receives the session access token. */
(() => {
  'use strict';
  if (window.top !== window || document.getElementById('cqm-widget-host')) return;

  const REQUEST = 'cqm:v1:request';
  const RESPONSE = 'cqm:v1:response';
  const RADIUS = 22;
  const CIRC = Math.PI * 2 * RADIUS;
  const SIZE = 60;
  const DEFAULT_Y = 112;
  const REFRESH_INTERVAL = 60000;
  const USAGE_PAGE_URL = 'https://chatgpt.com/settings/usage';
  const DRAG_THRESHOLD = 6;
  const GPT_GREEN = '#10A37F';
  const TEXT_PRIMARY = '#0D0D0D';
  const TEXT_SECONDARY = '#5D5D5D';
  // Chrome's UI language is used for the entire extension, independently of page language.
  const t = (key, values) => chrome.i18n.getMessage(key, values || undefined) || key;
  const uiLang = (chrome.i18n.getUILanguage() || 'en').toLowerCase().replace('_', '-').split('-')[0];
  const locale = ['zh', 'en', 'ja', 'ru', 'ko'].includes(uiLang) ? uiLang : 'en';

  let settings = { enabled: true, left: null, top: DEFAULT_Y };
  let snapshot = null;
  let error = '';
  let loading = false;
  let lastSeen = 0;
  let seq = 0;
  let drag = null;
  const pending = new Map();

  const host = document.createElement('div');
  host.id = 'cqm-widget-host';
  host.dataset.lang = locale;
  host.style.cssText = `position:fixed;z-index:2147483645;left:16px;top:${DEFAULT_Y}px;width:${SIZE}px;height:${SIZE}px;pointer-events:auto;`;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all:initial; color-scheme:light; }
    *, *::before, *::after { box-sizing:border-box; }
    .shell { position:relative; width:${SIZE}px; height:${SIZE}px; }
    .ring-control {
      width:${SIZE}px; height:${SIZE}px; border-radius:50%; position:relative;
      background:transparent; border:0; padding:0; margin:0;
      display:grid; place-items:center;
      cursor:pointer; touch-action:none; user-select:none; -webkit-user-select:none;
      -webkit-tap-highlight-color:transparent; outline:none;
    }
    .ring-control.dragging { cursor:grabbing; }
    .ring-control:focus-visible { outline:2px solid rgba(16,163,127,.35); outline-offset:4px; }
    .ring-svg { width:${SIZE}px; height:${SIZE}px; transform:rotate(-90deg); overflow:visible; }
    .track, .progress { fill:none; stroke-width:7.5; stroke-linecap:round; }
    .track { stroke: rgba(16,163,127,.16); }
    .progress {
      stroke:${GPT_GREEN};
      filter: drop-shadow(0 1px 2px rgba(16,163,127,.24));
      transition: stroke-dashoffset .35s ease;
    }
    .logo-disc {
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      width:34px; height:34px; border-radius:50%;
      background:#fff; display:grid; place-items:center;
      box-shadow:0 1px 4px rgba(0,0,0,.08);
      pointer-events:none;
    }
    .logo-disc svg { width:23px; height:23px; display:block; fill:#111; }
    .logo-disc.is-loading { animation:breath 1.05s ease-in-out infinite; }
    @keyframes breath { 50% { opacity:.48; } }

    .tooltip {
      position:absolute; top:4px; right:69px; width:max-content;
      max-width:calc(100vw - 16px);
      transform:translate(5px,0) scale(.987); transform-origin:right top;
      padding:10px 11px;
      border-radius:15px;
      background:#ffffff;
      border:1px solid #ececeb;
      box-shadow:0 10px 30px rgba(16,24,32,.09), 0 1px 4px rgba(16,24,32,.035);
      color:${TEXT_PRIMARY};
      font:400 13px/1.38 'Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI', 'Noto Sans CJK SC', sans-serif;
      letter-spacing:0;
      -webkit-font-smoothing:antialiased;
      pointer-events:none; opacity:0; visibility:hidden;
      transition:opacity .17s ease, transform .17s ease, visibility .17s ease;
    }
    .tooltip::before {
      content:''; position:absolute; top:var(--arrow-y, 20px); right:-4px; width:8px; height:8px;
      transform:translateY(-50%) rotate(45deg); background:#ffffff;
      border-right:1px solid #ececeb; border-top:1px solid #ececeb;
    }
    .shell:hover:not(.dragging) .tooltip,
    .shell:focus-within:not(.dragging) .tooltip {
      visibility:visible; opacity:1; transform:translate(0,0) scale(1);
    }
    .tooltip.right { right:auto; left:69px; transform:translate(-5px,0) scale(.987); transform-origin:left top; }
    .tooltip.right::before { right:auto; left:-4px; border-right:0; border-top:0; border-left:1px solid #ececeb; border-bottom:1px solid #ececeb; }
    .shell:hover:not(.dragging) .tooltip.right,
    .shell:focus-within:not(.dragging) .tooltip.right { transform:translate(0,0) scale(1); }
    .tooltip.below { right:auto; left:50%; top:69px; transform:translate(-50%,-5px) scale(.987); transform-origin:center top; }
    .tooltip.below::before { right:auto; left:var(--arrow-x, 50%); top:-4px; transform:translateX(-50%) rotate(45deg); border-right:0; border-top:1px solid #ececeb; border-left:1px solid #ececeb; border-bottom:0; }
    .shell:hover:not(.dragging) .tooltip.below,
    .shell:focus-within:not(.dragging) .tooltip.below { transform:translate(-50%,0) scale(1); }
    .tooltip.above { right:auto; left:50%; top:auto; bottom:69px; transform:translate(-50%,5px) scale(.987); transform-origin:center bottom; }
    .tooltip.above::before { right:auto; left:var(--arrow-x, 50%); top:auto; bottom:-4px; transform:translateX(-50%) rotate(45deg); border-right:1px solid #ececeb; border-bottom:1px solid #ececeb; border-left:0; border-top:0; }
    .shell:hover:not(.dragging) .tooltip.above,
    .shell:focus-within:not(.dragging) .tooltip.above { transform:translate(-50%,0) scale(1); }

    /* Restrained ChatGPT-style typography, quiet labels and a clear numeric hierarchy. */
    .tooltip * { font-family:'Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI', 'Noto Sans CJK SC', sans-serif; font-weight:400; }
    .quota-section { min-width:0; width:174px; max-width:100%; }
    /* Wider labels in Latin/Cyrillic scripts, without changing the Chinese UI. */
    :host([data-lang="en"]) .quota-section { width:216px; }
    :host([data-lang="ru"]) .quota-section { width:224px; }
    :host([data-lang="ja"]) .quota-section { width:191px; }
    :host([data-lang="ko"]) .quota-section { width:188px; }
    .quota-main { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .quota-copy { min-width:0; flex:1 1 auto; }
    .label { color:#000000; font-size:14px; font-weight:400; line-height:1.25; white-space:nowrap; }
    .pct { color:#000000; font:400 23px/1.05 'Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI', 'Noto Sans CJK SC', sans-serif; letter-spacing:-.8px; font-variant-numeric:tabular-nums; white-space:nowrap; flex:none; }
    .five-pct { font-size:24px; }
    .reset { margin-top:2px; color:#898b90; font-size:12.5px; font-weight:400; line-height:1.24; white-space:normal; }
    .section-divider { height:1px; background:#f0f0ef; margin:7px 0; }
    .credit-heading { color:#000000; font-size:14px; font-weight:400; line-height:1.37; white-space:nowrap; }
    .credit-amount { font:inherit; color:inherit; letter-spacing:inherit; font-variant-numeric:tabular-nums; }
    .credit-row { margin-top:3px; color:#77797d; font-size:12.5px; line-height:1.26; white-space:normal; font-variant-numeric:tabular-nums; }
    .credit-row:first-child { margin-top:3px; }
    .credit-date { color:#77797d; }
    .credit-left { color:#8b8d91; flex:none; }
    .credit-note { margin-top:3px; color:#8b8b8b; font-size:12.5px; line-height:1.25; max-width:174px; }
    .status { display:none; margin-top:8px; color:#b42318; font-size:12.5px; overflow-wrap:anywhere; }
    .status.show { display:block; }
    @media (prefers-reduced-motion:reduce) { .progress,.tooltip,.logo-disc { transition:none; animation:none; } }
  `;
  root.append(style);


  // Monochrome GPT knot vector.
  const mark = 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="shell" id="shell">
      <div class="ring-control" id="control" role="button" tabindex="0" aria-label="${t('controlAria')}">
        <svg class="ring-svg" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
          <circle class="track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}"></circle>
          <circle class="progress" id="quotaRing" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}"></circle>
        </svg>
        <div class="logo-disc" id="logoDisc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${mark}"/></svg></div>
      </div>
      <aside class="tooltip" id="tooltip" role="status" aria-live="polite">
        <div class="quota-section">
          <div class="quota-main"><div class="quota-copy"><div class="label">${t('fiveLabel')}</div><div class="reset" id="fiveReset">${t('loading')}</div></div><strong class="pct five-pct" id="fivePct">—</strong></div>
        </div>
        <div class="section-divider"></div>
        <div class="quota-section">
          <div class="quota-main"><div class="quota-copy"><div class="label">${t('weeklyLabel')}</div><div class="reset" id="weekReset">${t('loading')}</div></div><strong class="pct" id="weekPct">—</strong></div>
        </div>
        <div class="section-divider"></div>
        <div class="quota-section" id="creditSection">
          <div class="credit-heading">${t('creditLabel')}<span class="credit-amount" id="creditCount">—</span></div>
          <div id="creditDetails"><div class="reset">${t('loading')}</div></div>
        </div>
        <div class="status" id="status"></div>
      </aside>
    </div>`;
  root.append(wrap);

  const $ = id => root.getElementById(id);
  const shell = $('shell');
  const control = $('control');
  const tooltip = $('tooltip');
  const quotaRing = $('quotaRing');
  quotaRing.style.strokeDasharray = String(CIRC);
  quotaRing.style.strokeDashoffset = String(CIRC);

  function position() {
    if (!Number.isFinite(settings.left)) settings.left = Math.max(8, innerWidth - (SIZE + 8));
    if (!Number.isFinite(settings.top)) settings.top = DEFAULT_Y;
    settings.left = Math.max(8, Math.min(Math.max(8, innerWidth - (SIZE + 8)), settings.left));
    settings.top = Math.max(8, Math.min(Math.max(8, innerHeight - (SIZE + 8)), settings.top));
    host.style.left = `${settings.left}px`;
    host.style.top = `${settings.top}px`;
    placeTooltip();
  }

  function placeTooltip() {
    const tooltipWidth = tooltip.offsetWidth || 198;
    const tooltipHeight = tooltip.offsetHeight || 175;
    const spaceLeft = settings.left - 8;
    const spaceRight = innerWidth - settings.left - SIZE;
    let side = 'left';
    if (spaceLeft < tooltipWidth + 10) {
      side = spaceRight >= tooltipWidth + 10 ? 'right' : (innerHeight - settings.top - SIZE >= tooltipHeight + 10 ? 'below' : 'above');
    }
    tooltip.className = `tooltip ${side}`;
    if (side === 'left' || side === 'right') {
      // Normal layout: card top == ring top. Near the viewport bottom, shift only
      // as much as needed and keep the pointer aligned with the ring.
      const normalTop = settings.top + 4; // align with the visible ring stroke, not its 60px hit area
      const desiredTop = Math.max(8, Math.min(normalTop, innerHeight - tooltipHeight - 8));
      const offsetY = desiredTop - normalTop;
      tooltip.style.marginTop = `${offsetY}px`;
      tooltip.style.marginLeft = '';
      const arrowY = Math.max(12, Math.min(tooltipHeight - 12, 20 - offsetY));
      tooltip.style.setProperty('--arrow-y', `${arrowY}px`);
      tooltip.style.removeProperty('--arrow-x');
    } else {
      tooltip.style.marginTop = '';
      const centerX = settings.left + SIZE / 2;
      const half = tooltipWidth / 2;
      const shift = Math.max(0, half + 8 - centerX) - Math.max(0, centerX + half + 8 - innerWidth);
      tooltip.style.marginLeft = `${shift}px`;
      tooltip.style.setProperty('--arrow-x', `${Math.max(12, Math.min(tooltipWidth - 12, half - shift))}px`);
      tooltip.style.removeProperty('--arrow-y');
    }
  }

  function countdown(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return t('resetUnknown');
    const remaining = Math.ceil((ms - Date.now()) / 60000);
    if (remaining <= 0) return t('resetPassed');
    const days = Math.floor(remaining / 1440);
    const hours = Math.floor((remaining % 1440) / 60);
    const minutes = remaining % 60;
    if (days) return t('resetsDays', [String(days), String(hours)]);
    if (hours) return t('resetsHours', [String(hours), String(minutes)]);
    return t('resetsMinutes', String(Math.max(1, minutes)));
  }

  function formatCreditRemaining(ts, isSoonest = false) {
    if (!Number.isFinite(ts)) return t('expiryUnknown');
    const seconds = Math.ceil((ts - Date.now()) / 1000);
    if (seconds <= 0) return t('creditSeconds', '0');
    if (seconds < 60) return t('creditSeconds', String(seconds));
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return t('creditMinutes', String(minutes));
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return t('creditHours', String(hours));
    if (isSoonest) {
      // Use complete days and hours to show a more precise time for the next expiry.
      const completeDays = Math.floor(seconds / 86400);
      const completeHours = Math.floor((seconds % 86400) / 3600);
      return t('creditDaysHours', [String(completeDays), String(completeHours)]);
    }
    return t('creditDays', String(Math.ceil(hours / 24)));
  }

  function renderCredits(targetCount, container, resets) {
    container.replaceChildren();
    const line = (text, cls = 'credit-row') => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      container.appendChild(el);
    };
    const count = Number.isSafeInteger(resets?.availableCount) && resets.availableCount >= 0 ? resets.availableCount : null;
    targetCount.textContent = count === null ? '—' : t('creditCount', String(count));
    if (count === null) { line(t('creditCountUnknown'), 'reset'); return; }
    if (count === 0) { line(t('creditsNone'), 'reset'); return; }
    if (!resets?.detailsAvailable) {
      line(t(resets?.errorCode || 'creditDetailsUnavailable'), 'reset');
      return;
    }
    const visible = Array.isArray(resets.credits) ? resets.credits.slice(0, 4) : [];
    if (!visible.length) { line(t('creditNoExpiry'), 'reset'); return; }
    const chunks = visible.map((item, index) => formatCreditRemaining(item.expiresAt, index === 0));
    line(t('creditRemaining', chunks.join(t('listSeparator'))));
    if (count > visible.length) line(t('creditExtraCount', String(count - visible.length)), 'credit-note');
  }

  function render() {
    const five = snapshot?.fiveHour;
    const week = snapshot?.weekly;
    if (!five || !Number.isFinite(five.remaining)) {
      quotaRing.style.strokeDashoffset = String(CIRC);
      $('fivePct').textContent = '—';
      $('fiveReset').textContent = t('noWindowData');
    } else {
      const remaining = Math.min(100, Math.max(0, five.remaining));
      quotaRing.style.strokeDashoffset = String(CIRC * (1 - remaining / 100));
      quotaRing.dataset.pct = String(Math.round(remaining));
      $('fivePct').textContent = `${Math.round(remaining)}%`;
      $('fiveReset').textContent = countdown(five.resetAt);
    }
    if (!week || !Number.isFinite(week.remaining)) {
      $('weekPct').textContent = '—';
      $('weekReset').textContent = t('noWindowData');
    } else {
      const remaining = Math.min(100, Math.max(0, week.remaining));
      $('weekPct').textContent = `${Math.round(remaining)}%`;
      $('weekReset').textContent = countdown(week.resetAt);
    }
    renderCredits($('creditCount'), $('creditDetails'), snapshot?.resetCredits);
    $('logoDisc').classList.toggle('is-loading', loading);
    $('status').textContent = error;
    $('status').classList.toggle('show', !!error);
    position();
  }

  function refresh() {
    if (loading || !settings.enabled || document.hidden) return;
    loading = true;
    error = '';
    render();
    const requestId = `${Date.now().toString(36)}-${(++seq).toString(36)}`;
    const timeout = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      loading = false;
      error = t('connectionTimeout');
      render();
    }, 20000);
    pending.set(requestId, timeout);
    window.postMessage({ channel: REQUEST, requestId }, location.origin);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== RESPONSE) return;
    const id = event.data.requestId;
    if (!pending.has(id)) return;
    clearTimeout(pending.get(id));
    pending.delete(id);
    loading = false;
    const msg = event.data.payload;
    if (msg?.ok) {
      snapshot = msg.data;
      error = '';
      chrome.storage.local.set({ cqmSnapshot: snapshot });
    } else {
      error = msg?.errorCode ? t(msg.errorCode, msg.httpStatus ? String(msg.httpStatus) : undefined) : t('usageReadFailed');
    }
    lastSeen = Date.now();
    render();
  });

  function openUsagePage() {
    window.open(USAGE_PAGE_URL, '_blank', 'noopener,noreferrer');
  }
  control.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      left: settings.left, top: settings.top, moved: false
    };
    control.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  control.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      control.classList.add('dragging');
      shell.classList.add('dragging');
    }
    settings.left = drag.left + dx;
    settings.top = drag.top + dy;
    position();
  });
  function finishPointer(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.id) return;
    const wasDragged = drag.moved;
    drag = null;
    control.classList.remove('dragging');
    shell.classList.remove('dragging');
    if (wasDragged) {
      chrome.storage.local.set({ cqmLeft: settings.left, cqmTop: settings.top });
    } else if (!cancelled) {
      openUsagePage();
    }
  }
  control.addEventListener('pointerup', event => finishPointer(event));
  control.addEventListener('pointercancel', event => finishPointer(event, true));
  control.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openUsagePage();
      return;
    }
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
    const step = event.shiftKey ? 16 : 8;
    settings.left += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    settings.top += event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    position();
    chrome.storage.local.set({ cqmLeft:settings.left,cqmTop:settings.top });
    event.preventDefault();
  });

  window.addEventListener('resize', position);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastSeen > REFRESH_INTERVAL) refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.cqmEnabled) {
      settings.enabled = changes.cqmEnabled.newValue !== false;
      host.style.display = settings.enabled ? '' : 'none';
      if (settings.enabled && !snapshot) refresh();
    }
    if (changes.cqmRefreshSignal && settings.enabled) refresh();
  });
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'cqm-refresh') refresh();
  });

  chrome.storage.local.get(['cqmEnabled','cqmLeft','cqmTop','cqmSnapshot'], values => {
    settings.enabled = values.cqmEnabled !== false;
    settings.left = Number.isFinite(values.cqmLeft) ? values.cqmLeft : null;
    settings.top = Number.isFinite(values.cqmTop) ? values.cqmTop : DEFAULT_Y;
    const cached = values.cqmSnapshot;
    if (cached && cached.updatedAt && Date.now() - cached.updatedAt < 12*60*60*1000) snapshot = cached;
    (document.body || document.documentElement).appendChild(host);
    host.style.display = settings.enabled ? '' : 'none';
    render();
    if (settings.enabled) setTimeout(refresh, 350);
  });
  setInterval(() => { if (settings.enabled && !document.hidden) refresh(); }, REFRESH_INTERVAL);
  setInterval(() => { if (settings.enabled) render(); }, 10000);
})();
