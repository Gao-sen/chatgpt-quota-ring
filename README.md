# ChatGPT Quota Ring / ChatGPT 额度悬浮窗

A small, unofficial Chrome extension that displays the remaining ChatGPT Work / Codex quota in a draggable green ring.

一款非官方 Chrome 扩展：在 ChatGPT 网页显示可拖动的绿色额度圆环。

## Features / 功能

- Live 5-hour quota ring / 5 小时剩余额度圆环
- Hover for weekly quota and reset countdown / 悬停查看每周额度与重置倒计时
- Read-only saved reset credits and time to expiry / 只读展示重置机会及到期倒计时
- Click the ring to open ChatGPT usage page; drag to reposition / 单击打开额度页面，拖动调整位置
- Automatic localization based on Chrome UI language / 按 Chrome 界面语言自动切换 **简体中文、繁體中文、日本語、English、Русский、한국어**
- No account/API-key setup required / 无需额外填写账号或 API Key

## Install / 安装（GitHub 下载）

1. Download the latest `ChatGPT_Quota_Ring_v*.zip` from **Releases**.
2. Extract the ZIP and keep the extracted folder in a permanent location.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and choose the folder containing `manifest.json`.
5. Open or refresh `https://chatgpt.com/` while signed in.

中文：从 Releases 下载 ZIP → 解压 → 打开 `chrome://extensions/` → 开启「开发者模式」→ 「加载已解压的扩展程序」→ 选中含 `manifest.json` 的文件夹 → 刷新 ChatGPT。

**Update / 更新：** Extract the newer version over the original folder, then click **Reload** on `chrome://extensions/` and refresh ChatGPT. GitHub releases do **not** auto-update unpacked extensions.

## Languages / 语言

The extension uses Chrome's interface language (`chrome.i18n.getUILanguage`). Other languages fall back to English. Change Chrome's language and restart Chrome if you want another UI language. No manual setting is needed.

## Privacy / 隐私

The extension queries ChatGPT's same-origin session and **undocumented** quota endpoints. The session access token is only used transiently inside the page-side bridge; it is not written to extension storage. Only quota values, timestamps and UI settings are saved locally. No third-party analytics or network destination is included. The extension does not consume reset credits. Inspect `bridge.js`, `content.js` and `popup.js` for details.

**Limitations:** Internal endpoints can change without notice. This extension is not affiliated with or endorsed by OpenAI. The displayed quota is the available Work / Codex quota, not a promise of usage allowances for every ChatGPT model.

## Files / 文件

- `manifest.json` — Chrome Manifest V3
- `bridge.js` — same-origin quota lookup
- `content.js` — floating ring and tooltip
- `popup.html` + `popup.js` — browser popup
- `_locales/` — Chrome-native localizations
- `icons/` — extension icons

## License

No open-source license is included yet. The repository owner should select a license (for example MIT) only after verifying that they have the necessary rights to publish all assets and branding.

### v0.5.33

- Added Traditional Chinese (`zh_TW` and `zh_HK`).
- Unsupported Chrome languages now fall back to English.
- Tooltip aligns its top edge with the floating ring; pointer aligns with the five-hour quota row.
