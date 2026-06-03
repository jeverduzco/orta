# Orta — design notes

## Principles

Orta is a selection tool: the user highlights any text on the page and Orta offers to correct or translate it. It does not inject into editable fields, does not compete with rich editors, and does not rewrite the host site's DOM. The result is delivered as plain text the user copies and pastes wherever they want.

## Experience

- When the user selects text (with mouse, touch, or keyboard) on any page, Orta shows a floating bubble with the available actions: **Correct** and **Translate**.
- The bubble positions itself above or below the selection depending on available screen space.
- When an action is pressed, the bubble morphs into a spinner and then into a panel with the result.
- The result panel shows the processed text (selectable) and a **Copy** button. The user pastes the result wherever they need it.
- Translation uses a closed list of languages to avoid typos in the target language.
- The Orta UI language is independent of the translation target language.
- The popup lets the user turn Orta off globally or just for the current domain.
- The options page concentrates the API key, global toggles, target language, AI model selection (Flash, Minimax, Grok, DeepSeek via Vercel AI Gateway), exclusions, and a list of domains blocked by default for safety (banks, payments, SSO, government).
- On pages flagged as sensitive (login/checkout-like URL paths, visible password fields, default-blocked domains), the bubble does not appear.
- **AI model selection** is available in the Options page. Users can switch between `google/gemini-3.5-flash` (default), `minimax/minimax-m3`, `xai/grok-4.3`, and `deepseek/deepseek-v4-flash`. The choice is persisted in `chrome.storage.sync` and used for both correction/translation requests and API key validation against the gateway.

## MV3 architecture

```text
content script  ─chrome.runtime.sendMessage─▶  background service worker  ─fetch─▶  Vercel AI Gateway
```

- The content script never calls the provider directly.
- The service worker validates settings (including the user-selected AI model), blocked sites, and the API key before sending text to the configured model.
- `chrome.storage.local` holds the API key (so secrets are not synced across browsers).
- `chrome.storage.sync` holds preferences and excluded sites.
- `host_permissions` is restricted to `https://ai-gateway.vercel.sh/*`.
- The content script is declared on `<all_urls>` because the main feature must work on any page.

## Selection detection

Three signals feed the selection pipeline, in order of cost:

1. The standard `selectionchange` event on `document`.
2. A 250 ms polling fallback that compares the serialized selection text. Some sites (notably LinkedIn) suppress `selectionchange` at the document level.
3. `pointerup`, `mouseup`, and `keyup` (only on selection-relevant keys) so the bubble updates immediately on user gestures even if the events above are delayed.

Whichever fires first wins; the read is debounced (90 ms) to avoid flicker.

## Prompts

**Correction**

- Returns only the final text.
- Preserves language, tone, meaning, line breaks, URLs, variables, mentions, and code.
- If there are no errors, returns the original text unchanged. The UI surfaces a "no changes" state in that case.

**Translation**

- Returns only the translation to the target language.
- Preserves proper nouns, technical tags, and code fragments when appropriate.

## Disabled sites

Patterns accepted in `disabledSites`:

- `example.com` — blocks `example.com` and its subdomains.
- `*.example.com` — same effect; explicit form.
- Full URLs — normalized to their hostname.
- `!example.com` — **override**. Allows Orta on a domain that is blocked by the built-in safety list.

## Default safety list

A built-in list of domains where Orta is hidden out of the box: major banks, payment processors and checkouts, SSO providers, password managers, government TLDs, and crypto exchanges. The user can re-enable individual domains via the options page (which writes a `!domain.tld` override) without touching the rest of the list.

## Page-level safety heuristics

Even on domains that are not on the blocklist, Orta hides itself when:

- The URL path matches a login / signup / reset / verify / 2FA / checkout / billing / wallet / KYC pattern.
- The page exposes a visible (non-hidden, non-zero-size) `<input type="password">`.

These heuristics are re-evaluated on every selection, so they react to modals that open after page load.

## Privacy

Text is only sent to Vercel AI Gateway when the user presses an action. Orta does not process text in the background and does not keep a local history. The API key stays in the user's browser.

## Roadmap

- Configurable keyboard shortcut.
- Context-menu entry on selection.
- Frequent-language list with quick switcher and search.
- Separate "improve writing" mode (distinct from correction).
- Optional token / cost counter per request.
