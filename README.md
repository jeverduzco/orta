# Orta

Orta is a Chrome (Manifest V3) extension that **corrects and translates any text you select** — anywhere on the page. It works on inputs, contenteditable composers, articles, comments, code snippets, anything selectable. Powered by [Vercel AI Gateway](https://vercel.com/ai-gateway) with the `google/gemini-3.5-flash` model.

> Select text → a small bubble appears with **Correct** and **Translate** → result lands in a popover with a **Copy** button. No DOM rewrites, no fighting with rich editors.

## Features

- **Selection-first UX.** Works the same on plain inputs, rich editors (LinkedIn, X, Gmail), and read-only content.
- **Spell & light grammar correction.** Preserves language, tone, line breaks, URLs, mentions, code fragments, and proper nouns.
- **Translation** to a target language picked from a closed list (Spanish, English, French, German, Italian, Portuguese, Catalan, Quechua, Japanese, Simplified Chinese, Korean, Arabic).
- **Universal compatibility.** A 250 ms selection-poll fallback covers sites that suppress `selectionchange` (e.g. LinkedIn). Listens to `pointerup`, `mouseup`, and keyboard selection too.
- **Safety by default.** Hidden on bank, payments, SSO, password-manager, and government domains; hidden whenever a visible password field is present or the URL looks like login / checkout / 2FA.
- **Per-site control.** Popup toggle disables Orta on the current domain. The options page exposes the full built-in blocklist and lets you override individual domains with `!domain.tld`.
- **i18n.** UI in Spanish, English, and Portuguese — auto-detected from the browser locale on first install.
- **Privacy.** API key lives in `chrome.storage.local`; preferences in `chrome.storage.sync`. The extension only talks to `https://ai-gateway.vercel.sh/*`.

## Install (development)

```bash
git clone https://github.com/<your-handle>/orta.git
cd orta
npm install
npm run check       # typecheck + tests + build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and pick the `dist/` folder.
4. Open the extension's **Options** page and paste a Vercel AI Gateway API key.

## Scripts

| Script             | What it does                                |
|--------------------|---------------------------------------------|
| `npm run dev`      | Vite in watch mode; rebuilds `dist/` on save |
| `npm run build`    | Production build into `dist/`               |
| `npm run typecheck`| `tsc --noEmit`                              |
| `npm test`         | Vitest                                      |
| `npm run check`    | Typecheck + tests + build                   |

## How it works

```
content script  ──chrome.runtime.sendMessage──▶  background SW  ──fetch──▶  Vercel AI Gateway
```

The content script never talks to the model directly. The service worker validates settings, blocked sites, and the API key before forwarding the request. `host_permissions` is restricted to `https://ai-gateway.vercel.sh/*`.

## Vercel AI Gateway

Orta calls the OpenAI-compatible endpoint:

```
POST https://ai-gateway.vercel.sh/v1/chat/completions
```

Each user supplies their own API key. If you want to ship Orta with a managed key (e.g. for a published Chrome Web Store build), proxy these requests through your own backend so the key never lives in the extension bundle.

## Project layout

```
src/background/   MV3 service worker, AI Gateway calls
src/content/      Selection bubble + result panel (shadow DOM)
src/options/      Full settings page
src/popup/        Per-site quick toggles
src/shared/       Types, settings, i18n, domain matching
public/           manifest.json, _locales/, icons/
docs/design.md    Product & architecture notes
scripts/build.mjs Custom Vite build pipeline
```

## Roadmap

- Configurable keyboard shortcut for invoking actions
- Context-menu entry on selection
- Search-enabled language picker
- Separate "improve writing" mode
- Optional token / cost meter per request

## License

[MIT](./LICENSE)
