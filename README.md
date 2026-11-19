# Orta

<img src="brand/orta-lockup-ink.svg" alt="Orta" width="220">

Orta is a Chrome (Manifest V3) extension that **corrects and translates any text you select** — anywhere on the page. It works on inputs, contenteditable composers, articles, comments, code snippets, anything selectable. Powered by [Vercel AI Gateway](https://vercel.com/ai-gateway). The AI model is configurable in the Options page.

> Select text → a small bubble appears with **Correct** and **Translate** → the result streams into a card with **Copy** and, in editable fields, **Replace** (undoable with Cmd/Ctrl+Z). Read-only pages are never modified.

## Features

- **Selection-first UX.** Works the same on plain inputs, rich editors (LinkedIn, X, Gmail), and read-only content.
- **Spell & light grammar correction.** Preserves language, tone, line breaks, URLs, mentions, code fragments, and proper nouns.
- **Translation** to a target language picked from a closed list (Spanish, English, French, German, Italian, Portuguese, Catalan, Quechua, Japanese, Simplified Chinese, Korean, Arabic).
- **Streaming results.** Text appears as the model writes it; the request can be cancelled at any time.
- **See what changed.** Corrections show a word-level diff (deletions struck through, insertions highlighted) that can be toggled off.
- **Replace in place.** In inputs, textareas and rich editors the result can replace the selection through a native `insertText`, so the page's editor and its undo stack see a normal edit.
- **Always on top.** The UI renders in the browser top layer (Popover API), so it is never hidden behind page overlays, `z-index` stacks or `overflow: hidden` containers.
- **Universal compatibility.** Listens to `selectionchange` in the capture phase on `window` (sites that swallow it on `document`, like LinkedIn, can't hide it), plus pointer and keyboard gestures. A light poll runs only until a native `selectionchange` is seen.
- **Keyboard shortcuts.** `Alt+Shift+C` corrects and `Alt+Shift+L` translates the current selection (change them in `chrome://extensions/shortcuts`).
- **Safety by default.** Hidden on bank, payments, SSO, password-manager, and government domains; hidden whenever a visible password field is present or the URL looks like login / checkout / 2FA. The service worker enforces the same domain and path rules, and treats selected text strictly as data (prompt-injection hardening). Selections over 8,000 characters are refused.
- **Per-site control.** Popup toggle disables Orta on the current domain. The options page exposes the full built-in blocklist and lets you override individual domains with `!domain.tld`.
- **i18n.** UI in Spanish, English, and Portuguese — auto-detected from the browser locale on first install.
- **Configurable AI model.** Choose from multiple providers in the Options page (Connection → AI model). The selected model is used for correction, translation, and API key validation. See the full list in the [Vercel AI Gateway](#vercel-ai-gateway) section.
- **Privacy.** API key lives in `chrome.storage.local` and is only read by the service worker and options page, never by content scripts; preferences live in `chrome.storage.sync`. The extension only talks to `https://ai-gateway.vercel.sh/*`.

## Install (development)

```bash
git clone https://github.com/jeverduzco/orta.git
cd orta
npm install         # Node 20.19+ or 22.12+ (required by Vite 8)
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

Supported models (selectable in Options → Connection → AI model):

| Model ID                        | Label                  | Notes     |
|---------------------------------|------------------------|-----------|
| `meta/muse-ember`               | Muse Ember (Meta)      | Default   |
| `google/gemini-3.5-flash`       | Flash (Gemini 3.5)     |           |
| `minimax/minimax-m3`            | Minimax M3             |           |
| `deepseek/deepseek-v4-flash`    | DeepSeek V4 Flash      |           |

Models no longer offered (for example the retired xAI Grok ids, which the gateway no longer serves) are migrated to the default automatically. **Test connection** checks the key against the authenticated `/v1/credits` endpoint and confirms the model exists.

Each user supplies their own API key. If you want to ship Orta with a managed key (e.g. for a published Chrome Web Store build), proxy these requests through your own backend so the key never lives in the extension bundle.

## Brand

Orta aims to be a Swiss-army knife of AI utilities in the browser: the logo is an opened multitool, four tools fanning out of one rivet with the AI spark rising from the middle. Violet `#6C3CE9` is the brand fill, amber `#FFC24B` is reserved for the spark, and every fill is flat. Logo files, the palette and how to regenerate the extension icons are in [`brand/`](brand/README.md).

## Project layout

```
src/background/   MV3 service worker; gateway.ts holds the streaming client
src/content/      Selection bubble + result card (closed shadow DOM, top layer)
src/options/      Full settings page
src/popup/        Per-site quick toggles
src/shared/       Types, settings, i18n, domain matching
public/           manifest.json, _locales/, icons/
brand/            Logo sources, palette, icon generator
docs/design.md    Product & architecture notes
scripts/build.mjs Custom Vite build pipeline
```

## Roadmap

- Context-menu entry on selection
- Search-enabled language picker
- Separate "improve writing" mode
- Optional token / cost meter per request

## License

[MIT](./LICENSE)
