# Orta — design notes

## Principles

Orta is a selection tool: the user highlights any text on the page and Orta offers to correct or translate it. It never rewrites read-only content. In editable fields the user can opt in to **Replace**, which goes through the browser's native `insertText` command so the host editor (and its undo stack) handles the change like a normal edit; otherwise the result is copied.

## Experience

- When the user selects text (with mouse, touch, or keyboard) on any page, Orta shows a **22 px violet handle** with the amber spark from the logo (only the spark: at that size the full glyph reads like a dropdown chevron), docked to the **left of the selection's first line**. If there is no room on the left it docks above the line and the actions grow to the right. In inputs and textareas the position is measured with a mirror element, so it tracks the selected line rather than the whole field. It follows the selection on scroll/resize.
- Hovering the handle (or tapping it on touch) expands a compact chip with **Correct** and **Translate**, each followed by a visible language code (e.g. `ES`, `EN`). Clicking the code opens a language list with full names (keyboard: arrows, Home/End, Enter, Esc); long-press on the action still works.
- When an action is pressed, a card opens above or below the selection (whichever has room; its width is fixed up front so nothing jumps). The text streams in as the model writes it, with a **Cancel** button.
- The result card shows the text (selectable), a word-level diff for corrections (toggleable), **Retry**, **Copy**, and **Replace** when the selection is editable. Errors explain what failed and offer **Retry** for transient failures or **Open settings** for key/model problems.
- The UI lives in a closed shadow root inside a manual popover, so it renders in the top layer above any page stacking context.
- Translation uses a closed list of languages to avoid typos in the target language.
- The Orta UI language is independent of the translation target language.
- Correction and translation each have their own target language. The bubble exposes a per-action language chip; changing it persists the choice to settings, so it survives the next selection and page reloads (it does not reset to a single global default).
- The popup shows the current site and its state (active, disabled by the user, blocked for safety, hidden on a login/payment page) with the one action that fits, the tools as rows (icon, language, switch), the global switch, and the real keyboard shortcuts from `chrome.commands`.
- The options page is one column of sections: General (global switch, UI language), Tools (each tool with its own language), Keyboard shortcuts (with a button to Chrome's shortcut page), Connection (API key, model, test) and Sites (user exclusions and the built-in safety list). On first run, with no API key saved, Connection moves to the top.
- Extension pages share `src/shared/brand.css`, a mirror of the Orta Brand Kit tokens; the in-page UI keeps the same values in `src/content/styles.ts`.
- On pages flagged as sensitive (login/checkout-like URL paths, visible password fields, default-blocked domains), the bubble does not appear.
- **AI model selection** is available in the Options page. Users can switch between `meta/muse-ember` (default), `google/gemini-3.5-flash`, `minimax/minimax-m3`, and `deepseek/deepseek-v4-flash`. The choice is persisted in `chrome.storage.sync`; retired ids (such as the xAI Grok models the gateway no longer serves) migrate to the default.

## MV3 architecture

```text
content script  ─chrome.runtime.connect (port)─▶  background service worker  ─fetch (SSE)─▶  Vercel AI Gateway
               ◀─ delta / done / error ──────
```

- The content script never calls the provider directly.
- Each transform uses its own port. The service worker streams `delta` messages (throttled to one every 50 ms), then `done` or a typed `error` (`auth`, `rateLimited`, `timeout`, `modelUnavailable`, …). Closing the port aborts the upstream `fetch`.
- The service worker re-checks everything the content script checks (global/feature toggles, user and built-in blocked domains, login/checkout paths for both the tab and frame URL), plus an 8,000-character limit, before sending text to the model.
- Requests time out after 20 s without data and 90 s overall; 429/5xx and network failures are retried once (honouring short `Retry-After`).
- Key validation calls `/v1/credits` (authenticated) and `/v1/models/{provider}/{model}` (public, existence only).
- `chrome.storage.local` holds the API key (so secrets are not synced across browsers). Content scripts only ever request `disabledSites` from it.
- `chrome.storage.sync` holds preferences and excluded sites.
- `host_permissions` is restricted to `https://ai-gateway.vercel.sh/*`.
- The content script is declared on `<all_urls>` because the main feature must work on any page.

## Selection detection

Signals feed the selection pipeline, in order of preference:

1. `selectionchange`, listened to in the **capture phase on `window`**. That listener runs before any page listener on `document`, so sites that call `stopImmediatePropagation` there (notably LinkedIn) can't hide it.
2. `pointerup`, `pointercancel`, and `keyup` (only selection-relevant keys) so the bubble reacts immediately to gestures.
3. A 400 ms poll of a cheap selection fingerprint, as a last resort. It only runs while the tab is visible and focused, and stops for good once a native `selectionchange` has been observed in the frame.

Reads are debounced (90 ms, 0 ms mid-drag) and repositioning is coalesced with `requestAnimationFrame`.

## Prompts

The selected text is sent wrapped in `<orta_text>…</orta_text>` and the system prompt states that everything inside the tags is data, never instructions; a literal closing tag inside the selection is defused first. Wrappers the model echoes back (tags, code fences) are stripped, including half-received ones while streaming.

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
