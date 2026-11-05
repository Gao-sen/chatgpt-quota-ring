# ChatGPT Quota Ring

**A lightweight, unofficial Chrome extension for keeping ChatGPT Work / Codex usage limits in sight.**

See your remaining five-hour quota in a small, draggable ring. Hover to check your weekly quota, reset countdowns, and the time remaining on available reset credits — without leaving your conversation.

[**Download the latest release**](https://github.com/Gao-sen/chatgpt-quota-ring/releases/latest) · [Installation](#installation) · [Privacy](#privacy)

## Preview

![ChatGPT Quota Ring — six-language interface preview](https://github.com/user-attachments/assets/b8f0e7ed-af75-4d8d-908f-cbf9dda2678a)

## Features

- **At-a-glance usage:** A green progress ring shows your remaining five-hour quota.
- **Detailed hover card:** View your weekly quota and reset countdowns in a compact tooltip.
- **Reset credit tracking:** Check available reset credits and their remaining validity, when the service provides this data.
- **Quick access:** Click the ring to open the ChatGPT usage page in a new tab.
- **Flexible placement:** Drag the ring anywhere on the page; its position is remembered.
- **Automatic refresh:** Refreshes quota data periodically while ChatGPT is open and visible.
- **Automatic localization:** Uses your Chrome interface language; no manual language selection required.
- **No extra sign-in:** Works with your existing ChatGPT session; no API key is needed.

## Supported Languages

- English
- Simplified Chinese
- Traditional Chinese
- Japanese
- Korean
- Russian

The extension follows your **Chrome UI language**. If your language is not supported, the interface defaults to **English**.

## Installation

1. Open [**Releases**](https://github.com/Gao-sen/chatgpt-quota-ring/releases/latest) and download `ChatGPT_Quota_Ring_v*.zip`.
2. Extract the ZIP to a permanent folder. Do not delete or move that folder after installation.
3. In Chrome, open `chrome://extensions/`.
4. Enable **Developer mode** in the upper-right corner.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Sign in to [ChatGPT](https://chatgpt.com/) and refresh the page.

### Updating

Download the newer ZIP, extract it over your existing extension files, then open `chrome://extensions/` and click **Reload** for this extension. Refresh the ChatGPT tab afterward.

> **Note:** Extensions installed through **Load unpacked** do not receive automatic updates from GitHub Releases.

## Privacy & Security

- The extension uses your existing ChatGPT session to request quota information from ChatGPT's own web endpoints.
- The session access token is used transiently by the page-side bridge and is **not saved** to Chrome extension storage.
- Quota values, timestamps, and display preferences are stored locally in your browser.
- No third-party analytics or external data collection service is included.
- Reset credit information is **read-only**. The extension does not redeem or consume reset credits.

You can inspect the implementation in [`bridge.js`](bridge.js), [`content.js`](content.js), and [`popup.js`](popup.js).

## Project Structure

| File or folder | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension configuration (Manifest V3) |
| `bridge.js` | Reads quota data using the current ChatGPT session |
| `content.js` | Renders the draggable ring and hover card |
| `popup.html`, `popup.js` | Extension popup and controls |
| `_locales/` | Language resources |
| `icons/` | Extension icons |

## Compatibility & Disclaimer

This is an **independent, unofficial project** and is **not affiliated with or endorsed by OpenAI**. It relies on undocumented ChatGPT web endpoints, which may change or become unavailable without notice. Displayed values reflect the quota information returned by the service and should not be interpreted as limits for every ChatGPT model or feature.

## License

No open-source license has been added to this repository yet. All rights remain with their respective owners.

---

**Current release:** v0.5.33 · Six-language support, English fallback, and top-aligned hover card.
