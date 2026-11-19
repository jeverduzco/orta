/**
 * Shadow-DOM styles for the in-page UI. Colours live in custom properties on
 * :host so the light theme only redefines tokens instead of every rule.
 */
export const CONTENT_STYLES = `
  /* Values mirror the Orta Brand Kit tokens (src/shared/brand.css). */
  :host {
    --orta-surface: #1C1826;
    --orta-surface-raised: #262133;
    --orta-surface-hover: #2F2940;
    --orta-border: #332D42;
    --orta-border-strong: #4A4161;
    --orta-text: #F3F0FA;
    --orta-text-muted: #A9A3BC;
    --orta-brand: #6C3CE9;
    --orta-spark: #FFC24B;
    --orta-accent: #B3A0FF;
    --orta-accent-text: #C9BBFF;
    --orta-accent-fill: #6C3CE9;
    --orta-accent-soft: #2A2145;
    --orta-on-accent: #ffffff;
    --orta-success: #4ADE80;
    --orta-success-soft: rgb(74 222 128 / 0.14);
    --orta-danger: #FF8A8A;
    --orta-danger-soft: rgb(255 138 138 / 0.12);
    --orta-shadow: 0 1px 2px rgb(0 0 0 / 0.2), 0 12px 32px -8px rgb(0 0 0 / 0.5);
    --orta-shadow-small: 0 1px 2px rgb(0 0 0 / 0.18), 0 4px 12px -4px rgb(0 0 0 / 0.4);
    --orta-focus: 0 0 0 2px #B3A0FF;
    --orta-font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

    all: initial;
    color-scheme: dark;
    font-family: var(--orta-font);
  }

  @media (prefers-color-scheme: light) {
    :host {
      --orta-surface: #FFFFFF;
      --orta-surface-raised: #F1EEF8;
      --orta-surface-hover: #E9E4F5;
      --orta-border: #E4DFF0;
      --orta-border-strong: #CFC6E4;
      --orta-text: #17131F;
      --orta-text-muted: #5B5670;
      --orta-accent: #6C3CE9;
      --orta-accent-text: #5A2FD6;
      --orta-accent-fill: #6C3CE9;
      --orta-accent-soft: #ECE6FF;
      --orta-success: #1E7A45;
      --orta-success-soft: rgb(30 122 69 / 0.12);
      --orta-danger: #C2302F;
      --orta-danger-soft: rgb(194 48 47 / 0.08);
      --orta-shadow: 0 1px 2px rgb(23 19 31 / 0.06), 0 12px 32px -8px rgb(23 19 31 / 0.18);
      --orta-shadow-small: 0 1px 2px rgb(23 19 31 / 0.06), 0 4px 12px -4px rgb(23 19 31 / 0.16);
      --orta-focus: 0 0 0 2px #6C3CE9;
      color-scheme: light;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }

  [hidden] { display: none !important; }

  button {
    font: inherit;
    color: inherit;
    margin: 0;
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible {
    outline: none;
    box-shadow: var(--orta-focus);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ===== Panel (positioned in viewport coordinates) ===== */

  .panel {
    position: fixed;
    left: 0;
    top: 0;
    display: none;
    pointer-events: auto;
    color: var(--orta-text);
    font: 500 13px/1.4 var(--orta-font);
  }

  .panel[data-visible="true"] { display: block; }

  /* While the user is still dragging a selection, never intercept the pointer. */
  .panel[data-inert="true"] { pointer-events: none; }

  .panel[data-dock="left"]  { transform: translate(-100%, -50%); }
  .panel[data-dock="top"]   { transform: translate(0, -100%); }
  .panel[data-dock="above"] { transform: translate(0, -100%); }
  .panel[data-dock="below"] { transform: none; }

  .panel[data-animate="true"] > * {
    animation: orta-emerge 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .panel[data-dock="left"][data-animate="true"] > * { transform-origin: right center; }
  .panel[data-dock="above"][data-animate="true"] > *,
  .panel[data-dock="top"][data-animate="true"] > * { transform-origin: left bottom; }
  .panel[data-dock="below"][data-animate="true"] > * { transform-origin: left top; }

  @keyframes orta-emerge {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel[data-animate="true"] > * { animation: orta-fade 100ms ease-out both; }
    @keyframes orta-fade { from { opacity: 0; } to { opacity: 1; } }
  }

  /* ===== Bubble: a visible handle; hover / focus / tap reveals the actions ===== */

  .bubble {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  .panel[data-dock="top"] .bubble { flex-direction: row-reverse; }

  .bubble-handle {
    align-items: center;
    background: var(--orta-brand);
    border: 1px solid transparent;
    border-radius: 7px;
    box-shadow: var(--orta-shadow-small);
    color: #ffffff;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    height: 22px;
    justify-content: center;
    padding: 0;
    position: relative;
    transition: border-color 140ms ease, transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
    width: 22px;
  }

  /* Bigger hit area than the visible circle (24px+ target). */
  .bubble-handle::before {
    content: "";
    inset: -4px;
    position: absolute;
  }

  .bubble-handle svg { width: 13px; height: 13px; display: block; }
  .glyph-spark { fill: var(--orta-spark); }

  .bubble-handle:hover,
  .bubble[data-expanded="true"] .bubble-handle,
  .bubble:focus-within .bubble-handle {
    box-shadow: var(--orta-shadow-small), 0 0 0 3px var(--orta-accent-soft);
  }

  .bubble-handle:active { transform: scale(0.92); }

  .bubble-actions {
    align-items: center;
    background: var(--orta-surface);
    border: 1px solid var(--orta-border);
    border-radius: 999px;
    box-shadow: var(--orta-shadow-small);
    display: inline-flex;
    gap: 2px;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    padding: 0;
    pointer-events: none;
    transform: scale(0.94);
    transition:
      max-width 180ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity 120ms ease,
      padding 180ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bubble:hover .bubble-actions,
  .bubble:focus-within .bubble-actions,
  .bubble[data-expanded="true"] .bubble-actions {
    max-width: 240px;
    opacity: 1;
    padding: 2px;
    pointer-events: auto;
    transform: none;
  }

  .action-group {
    align-items: center;
    display: inline-flex;
  }

  .action-group + .action-group {
    border-left: 1px solid var(--orta-border);
    margin-left: 2px;
    padding-left: 2px;
  }

  .action-main,
  .action-lang {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: var(--orta-text-muted);
    cursor: pointer;
    display: inline-flex;
    height: 26px;
    justify-content: center;
    transition: background 120ms ease, color 120ms ease;
  }

  .action-main { min-width: 28px; padding: 0 6px; }
  .action-main svg { width: 14px; height: 14px; display: block; }

  .action-lang {
    font: 650 10.5px/1 var(--orta-font);
    letter-spacing: 0.04em;
    min-width: 26px;
    padding: 0 6px 0 2px;
  }

  .action-main:hover {
    background: var(--orta-surface-hover);
    color: var(--orta-text);
  }

  .action-lang:hover,
  .action-lang[aria-expanded="true"] {
    background: var(--orta-accent-soft);
    color: var(--orta-accent-text);
  }

  .action-main:active,
  .action-lang:active { transform: scale(0.95); }

  @media (prefers-reduced-motion: reduce) {
    .bubble-actions { transition: opacity 80ms ease; }
  }

  /* ===== Language picker ===== */

  .lang-picker {
    background: var(--orta-surface);
    border: 1px solid var(--orta-border);
    border-radius: 12px;
    box-shadow: var(--orta-shadow);
    display: none;
    gap: 2px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 260px;
    overflow-y: auto;
    padding: 4px;
    position: absolute;
    top: calc(100% + 6px);
    width: 272px;
  }

  .panel[data-dock="left"] .lang-picker { right: 0; }
  .panel[data-dock="top"] .lang-picker { left: 0; }
  .lang-picker[data-open="true"] { display: grid; }

  .lang-picker-title {
    color: var(--orta-text-muted);
    font: 600 10.5px/1.2 var(--orta-font);
    grid-column: 1 / -1;
    letter-spacing: 0.06em;
    padding: 6px 8px 4px;
    text-transform: uppercase;
  }

  .lang-option {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--orta-text);
    cursor: pointer;
    display: flex;
    gap: 8px;
    min-height: 30px;
    padding: 4px 8px;
    text-align: start;
  }

  .lang-option:hover,
  .lang-option:focus-visible { background: var(--orta-surface-hover); }

  .lang-option[aria-selected="true"] {
    background: var(--orta-accent-soft);
    color: var(--orta-accent-text);
  }

  .lang-code {
    color: var(--orta-text-muted);
    flex: 0 0 auto;
    font: 650 10px/1 var(--orta-font);
    letter-spacing: 0.04em;
    min-width: 20px;
  }

  .lang-option[aria-selected="true"] .lang-code { color: inherit; }

  .lang-name {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ===== Card: working / result / error ===== */

  .card {
    background: var(--orta-surface);
    border: 1px solid var(--orta-border);
    border-radius: 14px;
    box-shadow: var(--orta-shadow);
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: calc(100vw - 16px);
    min-width: min(400px, calc(100vw - 16px));
    padding: 10px 10px 10px 12px;
    width: max-content;
  }

  .card-header {
    align-items: center;
    display: flex;
    gap: 8px;
    min-height: 24px;
  }

  .card-title {
    align-items: center;
    color: var(--orta-accent-text);
    display: inline-flex;
    font: 700 11px/1.2 var(--orta-font);
    gap: 6px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .card[data-state="error"] .card-title { color: var(--orta-danger); }

  .card-meta {
    color: var(--orta-text-muted);
    font: 500 11.5px/1.2 var(--orta-font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--orta-text-muted);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    height: 26px;
    justify-content: center;
    margin-left: auto;
    width: 26px;
  }

  .icon-button:hover { background: var(--orta-surface-hover); color: var(--orta-text); }
  .icon-button svg { width: 14px; height: 14px; }

  .card-body {
    background: var(--orta-surface-raised);
    border: 1px solid var(--orta-border);
    border-radius: 10px;
    font: 500 13px/1.5 var(--orta-font);
    max-height: var(--orta-body-max, 260px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 10px;
    user-select: text;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .card[data-state="error"] .card-body {
    background: var(--orta-danger-soft);
    border-color: transparent;
    color: var(--orta-danger);
  }

  .card[data-no-changes="true"] .card-body { border-color: var(--orta-success); }

  .card-body ins {
    background: var(--orta-success-soft);
    border-radius: 3px;
    color: var(--orta-success);
    text-decoration: none;
  }

  .card-body del {
    color: var(--orta-danger);
    opacity: 0.8;
    text-decoration: line-through;
  }

  .card-body del + ins { margin-left: 2px; }

  .caret {
    animation: orta-blink 1s steps(2, start) infinite;
    background: var(--orta-spark);
    border-radius: 1px;
    display: inline-block;
    height: 1em;
    margin-left: 1px;
    vertical-align: text-bottom;
    width: 2px;
  }

  @keyframes orta-blink { to { visibility: hidden; } }

  .skeleton { display: grid; gap: 6px; padding: 2px 0; }

  .skeleton span {
    animation: orta-pulse 1.2s ease-in-out infinite;
    background: var(--orta-surface-hover);
    border-radius: 4px;
    display: block;
    height: 10px;
  }

  .skeleton span:nth-child(2) { width: 80%; animation-delay: 120ms; }
  .skeleton span:nth-child(3) { width: 55%; animation-delay: 240ms; }

  @keyframes orta-pulse { 50% { opacity: 0.45; } }

  .spinner {
    animation: orta-spin 800ms linear infinite;
    border: 1.5px solid var(--orta-accent-soft);
    border-radius: 999px;
    border-top-color: var(--orta-accent);
    display: inline-block;
    height: 11px;
    width: 11px;
  }

  @keyframes orta-spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .spinner, .caret, .skeleton span { animation-duration: 2.4s; }
  }

  .card-footer {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  .card-footer:empty { display: none; }

  .status-badge {
    align-items: center;
    color: var(--orta-success);
    display: inline-flex;
    font: 600 11.5px/1.2 var(--orta-font);
    gap: 4px;
    margin-right: auto;
  }

  .btn {
    align-items: center;
    background: var(--orta-surface-raised);
    border: 1px solid var(--orta-border);
    border-radius: 8px;
    color: var(--orta-text);
    cursor: pointer;
    display: inline-flex;
    font: 600 12px/1 var(--orta-font);
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    white-space: nowrap;
  }

  .btn:hover { background: var(--orta-surface-hover); }
  .btn:active { transform: scale(0.97); }
  .btn svg { width: 13px; height: 13px; flex: 0 0 auto; }

  .btn-icon {
    justify-content: center;
    padding: 0;
    width: 30px;
  }

  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--orta-text-muted);
  }

  .btn-ghost:hover { color: var(--orta-text); }
  .btn-start { margin-right: auto; }

  .btn-primary {
    background: var(--orta-accent-fill);
    border-color: transparent;
    color: var(--orta-on-accent);
  }

  .btn-primary:hover { background: var(--orta-accent-fill); filter: brightness(1.08); }
  .btn-primary:active { background: #4B21B8; filter: none; }

  .btn[data-done="true"] {
    background: var(--orta-success-soft);
    border-color: transparent;
    color: var(--orta-success);
    filter: none;
  }

`;
