const t = (key, values) => chrome.i18n.getMessage(key, values || undefined) || key;
document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
const countNode = document.getElementById('count');
const datesNode = document.getElementById('dates');
const enabledNode = document.getElementById('enabled');
function timeText(raw, isSoonest = false) {
  if (!Number.isFinite(raw)) return t('expiryUnknown');
  let seconds = Math.ceil((raw - Date.now()) / 1000);
  if (seconds <= 0) return t('creditRemaining', t('creditSeconds', '0'));
  if (seconds < 60) return t('creditRemaining', t('creditSeconds', String(seconds)));
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t('creditRemaining', t('creditMinutes', String(minutes)));
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return t('creditRemaining', t('creditHours', String(hours)));
  if (isSoonest) {
    const completeDays = Math.floor(seconds / 86400);
    const completeHours = Math.floor((seconds % 86400) / 3600);
    return t('creditRemaining', t('creditDaysHours', [String(completeDays), String(completeHours)]));
  }
  const days = Math.ceil(hours / 24);
  return t('creditRemaining', t('creditDays', String(days)));
}
function display(snapshot) {
  const value = snapshot?.resetCredits;
  const count = Number.isSafeInteger(value?.availableCount) && value.availableCount >= 0 ? value.availableCount : null;
  countNode.textContent = count === null ? '—' : t('creditCount', String(count));
  if (count === null) { datesNode.textContent = t('popupNoCount'); return; }
  if (count === 0) { datesNode.textContent = t('creditsNone'); return; }
  if (!value?.detailsAvailable) { datesNode.textContent = t(value?.errorCode || 'popupNoDetails'); return; }
  const credits = Array.isArray(value.credits) ? value.credits : [];
  const lines = credits.slice(0, 10).map((item, index) => `${timeText(item.expiresAt, index === 0)}`);
  if (credits.length < count) lines.push(t('popupExtraCount', String(count - credits.length)));
  datesNode.textContent = lines.length ? lines.join('\n') : t('popupNoExpiry');
}
function update() {
  chrome.storage.local.get(['cqmSnapshot','cqmEnabled'], values => {
    enabledNode.checked = values.cqmEnabled !== false;
    display(values.cqmSnapshot);
  });
}
update();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.cqmSnapshot || changes.cqmEnabled)) update();
});
enabledNode.addEventListener('change', () => chrome.storage.local.set({ cqmEnabled:enabledNode.checked }));
document.getElementById('usage').addEventListener('click', () => chrome.tabs.create({url:'https://chatgpt.com/settings/usage'}));
document.getElementById('refresh').addEventListener('click', () => {
  datesNode.textContent = t('popupRefreshNotice');
  chrome.storage.local.set({ cqmRefreshSignal:Date.now() });
});
