import { getCopy } from '../shared/i18n';
import {
  getPublicSettings,
  publicDefaults,
  setPublicSettings,
  type PublicOrtaSettings,
} from '../shared/settings';
import {
  DEFAULT_TARGET_LANGUAGE,
  getTargetLanguageLabel,
  normalizeTargetLanguage,
  TARGET_LANGUAGE_REGISTRY,
  type TargetLanguageCode,
} from '../shared/languages';
import { normalizeAppLanguage } from '../shared/appLanguage';
import { isOrtaAvailableForUrl } from '../shared/sites';
import { isPageSafeForOrta } from './pageGuard';
import {
  CONTENT_SCRIPT_COMMAND_TYPE,
  type OrtaAction,
  type ContentScriptCommand,
  type TransformResponse,
} from '../shared/messages';

type OrtaWindow = Window & typeof globalThis & { __ortaContentInstanceId?: string };

type SelectionSnapshot = {
  text: string;
  rect: DOMRect;
  source: 'range' | 'input';
};

type PanelMode = 'bubble' | 'loading' | 'result' | 'error';

const ROOT_TAG = 'orta-root';
const MIN_SELECTION_LENGTH = 2;
const SELECTION_DEBOUNCE_MS = 90;
const HIDE_DELAY_MS = 120;
const PANEL_OFFSET = 8;
const PANEL_MAX_WIDTH = 360;
const COPIED_RESET_MS = 1600;
const BUBBLE_LONG_PRESS_MS = 400;
const INSTANCE_ID = crypto.randomUUID();

let settings: PublicOrtaSettings = publicDefaults;
let currentSnapshot: SelectionSnapshot | null = null;
let panelMode: PanelMode = 'bubble';
let lastResultText = '';
let isProcessing = false;
let contextValid = true;
let teardownDone = false;
let hideTimeout = 0;
let copiedTimeout = 0;
const teardownController = new AbortController();

let bubbleCorrectionLanguage: TargetLanguageCode = DEFAULT_TARGET_LANGUAGE;
let bubbleTranslationLanguage: TargetLanguageCode = DEFAULT_TARGET_LANGUAGE;
let activeLangAction: 'correct' | 'translate' | null = null;

const ortaDebug = (...args: unknown[]): void => {
  try {
    if (localStorage.getItem('ortaDebug') === '1') {
      console.log('[orta]', ...args);
    }
  } catch {
    /* localStorage blocked */
  }
};

const getContentCopy = () => getCopy(settings.appLanguage);

const shouldSkipFrame = (): boolean => {
  try {
    if (document.querySelector('.kix-appview, .punch-viewmode, .docs-texteventtarget-iframe')) {
      return true;
    }
  } catch {
    return true;
  }
  if (window.top !== window) {
    let frameEl: HTMLIFrameElement | null = null;
    try {
      frameEl = window.frameElement as HTMLIFrameElement | null;
    } catch {
      /* cross-origin frame element access denied */
    }
    if (frameEl instanceof HTMLIFrameElement) {
      const sandbox = frameEl.getAttribute('sandbox');
      if (sandbox !== null && !/\ballow-same-origin\b/i.test(sandbox)) {
        return true;
      }
    }
    if (window.location.href === 'about:blank' && !document.body) {
      return true;
    }
  }
  return false;
};

const SKIP_FRAME = shouldSkipFrame();

const teardownOrphan = (): void => {
  if (teardownDone) return;
  teardownDone = true;
  try {
    teardownController.abort();
  } catch {
    /* already aborted */
  }
  try {
    rootHost.remove();
  } catch {
    /* not in DOM */
  }
};

const isExtensionContextValid = (): boolean => {
  if (!contextValid) return false;
  try {
    if (!chrome?.runtime?.id) {
      contextValid = false;
      teardownOrphan();
      return false;
    }
  } catch {
    contextValid = false;
    teardownOrphan();
    return false;
  }
  return true;
};

if (!SKIP_FRAME) {
  (window as OrtaWindow).__ortaContentInstanceId = INSTANCE_ID;
  document.querySelectorAll(ROOT_TAG).forEach((element) => element.remove());
}

const isCurrentInstance = (): boolean =>
  !SKIP_FRAME &&
  isExtensionContextValid() &&
  (window as OrtaWindow).__ortaContentInstanceId === INSTANCE_ID;

const isOrtaAvailable = (): boolean =>
  isOrtaAvailableForUrl(window.location.href, settings) && isPageSafeForOrta(window.location.href);

// ===== Shell =====

const rootHost = document.createElement(ROOT_TAG);
const shadowRoot = rootHost.attachShadow({ mode: 'open' });

shadowRoot.innerHTML = `
  <style>
    :host {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      z-index: 999999 !important;
      pointer-events: none !important;
      contain: layout style;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .panel {
      position: absolute;
      left: 0;
      top: 0;
      display: none;
      pointer-events: auto;
      width: max-content;
      max-width: ${PANEL_MAX_WIDTH}px;
      animation: orta-pop 130ms ease-out;
    }

    .panel[data-visible="true"] { display: block; }

    @keyframes orta-pop {
      from { opacity: 0; transform: translateY(-2px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Bubble — icon-only, minimal footprint */
    .bubble {
      align-items: center;
      background: rgba(20, 22, 28, 0.68);
      backdrop-filter: blur(10px) saturate(120%);
      -webkit-backdrop-filter: blur(10px) saturate(120%);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.12);
      color: #eef0f5;
      display: inline-flex;
      flex-wrap: nowrap;
      gap: 0;
      padding: 2px;
      width: max-content;
    }

    .bubble button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: rgba(220, 222, 232, 0.58);
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      justify-content: center;
      padding: 5px;
      transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
    }

    .bubble button + button {
      border-left: 1px solid rgba(255, 255, 255, 0.05);
    }

    .bubble button:hover,
    .bubble button:focus-visible {
      background: rgba(255, 255, 255, 0.07);
      color: rgba(238, 240, 245, 0.92);
      outline: none;
    }

    .bubble button svg {
      display: block;
      height: 13px;
      opacity: 0.9;
      width: 13px;
    }

    /* Compact language picker (appears on demand under the bubble; keeps UI non-intrusive) */
    .lang-picker {
      position: absolute;
      background: linear-gradient(180deg, rgba(24, 26, 34, 0.98), rgba(18, 20, 28, 0.98));
      backdrop-filter: blur(12px) saturate(130%);
      -webkit-backdrop-filter: blur(12px) saturate(130%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      padding: 5px;
      z-index: 10;
      min-width: 120px;
      max-width: 240px;
    }

    .lang-picker button {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      color: #e0e2ed;
      cursor: pointer;
      font: 600 9.5px/1 ui-monospace, ui-sans-serif, system-ui, sans-serif;
      padding: 2px 6px;
      min-width: 26px;
      text-align: center;
      letter-spacing: 0.01em;
    }

    .lang-picker button:hover {
      background: rgba(167, 139, 250, 0.2);
      border-color: rgba(167, 139, 250, 0.35);
      color: #c4b5fd;
    }

    .lang-picker button[aria-selected="true"] {
      background: rgba(167, 139, 250, 0.35);
      border-color: rgba(167, 139, 250, 0.6);
      color: #fff;
    }

    /* Result panel */
    .result {
      background: linear-gradient(180deg, rgba(24, 26, 34, 0.96), rgba(18, 20, 28, 0.96));
      backdrop-filter: blur(14px) saturate(135%);
      -webkit-backdrop-filter: blur(14px) saturate(135%);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 12px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.25);
      color: #eef0f5;
      display: flex;
      flex-direction: column;
      min-width: 240px;
      padding: 10px 12px 10px;
    }

    .result-header {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .result-title {
      color: rgba(196, 181, 253, 0.9);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .result-close {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: rgba(220, 222, 232, 0.55);
      cursor: pointer;
      display: inline-flex;
      padding: 2px 4px;
      transition: background 120ms ease, color 120ms ease;
    }

    .result-close:hover,
    .result-close:focus-visible {
      background: rgba(255, 255, 255, 0.06);
      color: #eef0f5;
      outline: none;
    }

    .result-text {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 8px;
      color: #eef0f5;
      font: 500 12.5px/1.45 ui-sans-serif, system-ui, sans-serif;
      max-height: 220px;
      overflow-y: auto;
      padding: 8px 10px;
      user-select: text;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .result-text[data-no-changes="true"] {
      border-color: rgba(74, 222, 128, 0.35);
    }

    .no-changes-badge {
      align-items: center;
      color: rgba(134, 239, 172, 0.92);
      display: none;
      font: 600 10.5px/1.2 ui-sans-serif, system-ui, sans-serif;
      gap: 4px;
      letter-spacing: 0.06em;
      margin-right: auto;
      text-transform: uppercase;
    }

    .result-text[data-no-changes="true"] ~ .result-footer .no-changes-badge {
      display: inline-flex;
    }

    .result-footer {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .copy-button {
      align-items: center;
      background: linear-gradient(135deg, #a78bfa, #8b5cf6);
      border: 1px solid rgba(167, 139, 250, 0.55);
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.32);
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      font: 600 11.5px/1.2 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: -0.005em;
      padding: 7px 12px;
      transition: background 140ms ease, transform 140ms ease, box-shadow 140ms ease;
      white-space: nowrap;
    }

    .copy-button:hover { background: linear-gradient(135deg, #b8a4f8, #9f74f7); }
    .copy-button:active { transform: scale(0.985); }
    .copy-button svg { width: 13px; height: 13px; }

    .copy-button.is-done {
      background: rgba(74, 222, 128, 0.2);
      border-color: rgba(74, 222, 128, 0.5);
      box-shadow: none;
      color: #86efac;
    }

    /* Loading — matches bubble footprint */
    .loading {
      align-items: center;
      background: rgba(20, 22, 28, 0.68);
      backdrop-filter: blur(10px) saturate(120%);
      -webkit-backdrop-filter: blur(10px) saturate(120%);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.12);
      display: inline-flex;
      justify-content: center;
      padding: 6px;
    }

    .spinner {
      animation: orta-spin 900ms linear infinite;
      border: 1.5px solid rgba(255, 255, 255, 0.08);
      border-top-color: rgba(220, 222, 232, 0.52);
      border-radius: 999px;
      flex: 0 0 auto;
      height: 11px;
      opacity: 0.9;
      width: 11px;
    }

    @keyframes orta-spin {
      to { transform: rotate(360deg); }
    }

    /* Error */
    .error-text {
      color: #fca5a5;
      font: 500 11.5px/1.4 ui-sans-serif, system-ui, sans-serif;
      padding: 6px 4px;
    }

    /* Light theme overrides (respects prefers-color-scheme) */
    @media (prefers-color-scheme: light) {
      .bubble {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
        color: #111827;
      }

      .bubble button {
        color: rgba(55, 65, 81, 0.55);
      }

      .bubble button + button {
        border-left-color: rgba(0, 0, 0, 0.06);
      }

      .bubble button:hover,
      .bubble button:focus-visible {
        background: rgba(0, 0, 0, 0.05);
        color: rgba(17, 24, 39, 0.9);
      }

      .loading {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
      }

      .result {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(249, 250, 252, 0.96));
        border: 1px solid rgba(0, 0, 0, 0.09);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.10), 0 3px 8px rgba(0, 0, 0, 0.05);
        color: #111827;
      }

      .result-title {
        color: rgba(109, 40, 217, 0.92);
      }

      .result-close {
        color: rgba(107, 114, 128, 0.75);
      }

      .result-close:hover,
      .result-close:focus-visible {
        background: rgba(0, 0, 0, 0.05);
        color: #111827;
      }

      .result-text {
        background: rgba(0, 0, 0, 0.03);
        border-color: rgba(0, 0, 0, 0.08);
        color: #111827;
      }

      .result-text[data-no-changes="true"] {
        border-color: rgba(22, 101, 52, 0.35);
      }

      .no-changes-badge {
        color: #166534;
      }

      .spinner {
        border-color: rgba(0, 0, 0, 0.08);
        border-top-color: rgba(55, 65, 81, 0.48);
      }

      .error-text {
        color: #b91c1c;
      }

      .copy-button.is-done {
        background: rgba(22, 101, 52, 0.09);
        border-color: rgba(22, 101, 52, 0.35);
        color: #166534;
      }

      .lang-picker {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 252, 0.98));
        border-color: rgba(0, 0, 0, 0.1);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      .lang-picker button {
        background: rgba(0, 0, 0, 0.04);
        border-color: rgba(0, 0, 0, 0.08);
        color: #374151;
      }

      .lang-picker button:hover {
        background: rgba(124, 58, 237, 0.12);
        border-color: rgba(124, 58, 237, 0.3);
        color: #5b21b6;
      }

      .lang-picker button[aria-selected="true"] {
        background: rgba(124, 58, 237, 0.2);
        border-color: rgba(124, 58, 237, 0.45);
        color: #4c1d95;
      }
    }
  </style>
  <div class="panel" id="panel">
    <div class="bubble" id="bubble" role="toolbar" aria-label="Orta">
      <button class="bubble-action" data-action="correct" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 6 3 3"/></svg>
      </button>
      <button class="bubble-action" data-action="translate" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m14 22 5-10 5 10"/><path d="M15.5 18h7"/></svg>
      </button>
    </div>
    <div class="lang-picker" id="lang-picker" role="listbox" style="display:none;"></div>
    <div class="loading" id="loading" role="status" aria-live="polite" style="display:none;">
      <span class="spinner" aria-hidden="true"></span>
    </div>
    <div class="result" id="result" style="display:none;">
      <div class="result-header">
        <span class="result-title" id="result-title"></span>
        <button class="result-close" id="result-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="result-text" id="result-text"></div>
      <div class="result-footer">
        <span class="no-changes-badge" id="no-changes-badge"></span>
        <button class="copy-button" id="result-copy" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="copy-label"></span>
        </button>
      </div>
    </div>
    <div class="result" id="error" style="display:none;">
      <div class="result-header">
        <span class="result-title" id="error-title"></span>
        <button class="result-close" id="error-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="error-text" id="error-text"></div>
    </div>
  </div>
`;

const getMountTarget = (): HTMLElement => document.body ?? document.documentElement;

const ensureRootHostIsLast = (): void => {
  if (SKIP_FRAME) return;
  const target = getMountTarget();
  if (rootHost.parentNode !== target || target.lastElementChild !== rootHost) {
    target.append(rootHost);
  }
};

if (!SKIP_FRAME) {
  const mount = () => {
    getMountTarget().append(rootHost);
    const observer = new MutationObserver(() => ensureRootHostIsLast());
    observer.observe(getMountTarget(), { childList: true });
    teardownController.signal.addEventListener('abort', () => observer.disconnect());
  };
  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, {
      once: true,
      signal: teardownController.signal,
    });
  }
}

const panel = shadowRoot.querySelector<HTMLDivElement>('#panel');
const bubble = shadowRoot.querySelector<HTMLDivElement>('#bubble');
const loading = shadowRoot.querySelector<HTMLDivElement>('#loading');
const resultBox = shadowRoot.querySelector<HTMLDivElement>('#result');
const resultTitle = shadowRoot.querySelector<HTMLSpanElement>('#result-title');
const resultText = shadowRoot.querySelector<HTMLDivElement>('#result-text');
const resultCopy = shadowRoot.querySelector<HTMLButtonElement>('#result-copy');
const copyLabel = shadowRoot.querySelector<HTMLSpanElement>('#copy-label');
const resultClose = shadowRoot.querySelector<HTMLButtonElement>('#result-close');
const errorBox = shadowRoot.querySelector<HTMLDivElement>('#error');
const errorTitle = shadowRoot.querySelector<HTMLSpanElement>('#error-title');
const errorText = shadowRoot.querySelector<HTMLDivElement>('#error-text');
const errorClose = shadowRoot.querySelector<HTMLButtonElement>('#error-close');
const correctBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="correct"]');
const translateBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="translate"]');
const noChangesBadge = shadowRoot.querySelector<HTMLSpanElement>('#no-changes-badge');
const langPicker = shadowRoot.querySelector<HTMLDivElement>('#lang-picker');

// ===== Selection reading =====

const isTextInput = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement => {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return type === '' || type === 'text' || type === 'search';
  }
  return false;
};

const readInputSelection = (element: HTMLInputElement | HTMLTextAreaElement): SelectionSnapshot | null => {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (end <= start) return null;
  const text = element.value.slice(start, end).trim();
  if (text.length < MIN_SELECTION_LENGTH) return null;
  // Native inputs/textareas don't expose per-character rects to script.
  // Use the field's bounding rect; the bubble lands above the field, near the
  // selection visually (good-enough fidelity, no measurement hacks).
  const rect = element.getBoundingClientRect();
  return { text, rect, source: 'input' };
};

const readWindowSelection = (): SelectionSnapshot | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (text.length < MIN_SELECTION_LENGTH) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text: sel.toString().trim(), rect, source: 'range' };
};

const readActiveSelection = (): SelectionSnapshot | null => {
  const focused = document.activeElement;
  if (isTextInput(focused)) {
    const inputSnap = readInputSelection(focused);
    if (inputSnap) return inputSnap;
  }
  return readWindowSelection();
};

// ===== Panel state =====

const cancelHideTimeout = (): void => {
  if (hideTimeout) {
    window.clearTimeout(hideTimeout);
    hideTimeout = 0;
  }
};

const setMode = (next: PanelMode): void => {
  panelMode = next;
  const isBubble = next === 'bubble';
  if (bubble) bubble.style.display = isBubble ? '' : 'none';
  if (loading) loading.style.display = next === 'loading' ? '' : 'none';
  if (resultBox) resultBox.style.display = next === 'result' ? '' : 'none';
  if (errorBox) errorBox.style.display = next === 'error' ? '' : 'none';
  if (!isBubble) {
    hideLangPicker();
  }
};

const hidePanel = (): void => {
  cancelHideTimeout();
  if (!panel) return;
  panel.setAttribute('data-visible', 'false');
  currentSnapshot = null;
  hideLangPicker();
  setMode('bubble');
};

const positionPanel = (rect: DOMRect): void => {
  if (!panel) return;
  // Wait a frame so the panel has its real dimensions for clamping.
  panel.setAttribute('data-visible', 'true');
  requestAnimationFrame(() => {
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width || 200;
    const panelH = panelRect.height || 40;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const centerX = rect.left + rect.width / 2 - panelW / 2;
    const wantAbove = rect.top - PANEL_OFFSET - panelH >= 8;
    const topVp = wantAbove ? rect.top - PANEL_OFFSET - panelH : rect.bottom + PANEL_OFFSET;
    const clampedLeft = Math.max(8, Math.min(centerX, vw - panelW - 8));
    const clampedTop = Math.max(8, Math.min(topVp, vh - panelH - 8));

    panel.style.transform = `translate(${Math.round(clampedLeft + scrollX)}px, ${Math.round(clampedTop + scrollY)}px)`;
  });
};

const renderLabels = (): void => {
  const copy = getContentCopy();

  if (copyLabel) copyLabel.textContent = copy.copyAction;

  if (correctBtn) correctBtn.style.display = settings.correctionEnabled ? '' : 'none';
  if (translateBtn) translateBtn.style.display = settings.translationEnabled ? '' : 'none';
};

const renderBubbleLanguages = (): void => {
  const copy = getContentCopy();
  const appLang = normalizeAppLanguage(settings.appLanguage);

  if (correctBtn) {
    const fullLabel = getTargetLanguageLabel(bubbleCorrectionLanguage, appLang);
    const label = `${copy.correctAction} (${fullLabel})`;
    correctBtn.title = label;
    correctBtn.setAttribute('aria-label', label);
  }

  if (translateBtn) {
    const fullLabel = getTargetLanguageLabel(bubbleTranslationLanguage, appLang);
    const label = `${copy.translateAction} (${fullLabel})`;
    translateBtn.title = label;
    translateBtn.setAttribute('aria-label', label);
  }
};

const persistLanguageChoice = (
  action: 'correct' | 'translate',
  code: TargetLanguageCode,
): Promise<void> => {
  // Update the in-memory copy synchronously so a selection that happens before
  // the storage round-trip already reflects the new default.
  const patch =
    action === 'correct' ? { correctionLanguage: code } : { targetLanguage: code };
  settings = { ...settings, ...patch };
  return setPublicSettings(patch).catch((error) => {
    ortaDebug('failed to persist language choice', error);
  });
};

const renderLangPicker = (current: TargetLanguageCode): void => {
  if (!langPicker) return;
  langPicker.innerHTML = '';

  const appLang = normalizeAppLanguage(settings.appLanguage);

  TARGET_LANGUAGE_REGISTRY.forEach((entry) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const displayCode = entry.code.toUpperCase().replace('-HANS', '');
    btn.textContent = displayCode;
    btn.title = getTargetLanguageLabel(entry.code, appLang);
    btn.dataset.code = entry.code;
    if (entry.code === current) {
      btn.setAttribute('aria-selected', 'true');
    }
    // Prevent focus moving into the picker, which collapses the page selection
    // on some sites and would dismiss the bubble before the click registers.
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const action = activeLangAction;
      if (action === 'correct') {
        bubbleCorrectionLanguage = entry.code;
      } else if (action === 'translate') {
        bubbleTranslationLanguage = entry.code;
      }
      renderBubbleLanguages();
      hideLangPicker();
      // Persist the choice so it survives the next selection and page reloads.
      if (action) void persistLanguageChoice(action, entry.code);
    });
    langPicker.appendChild(btn);
  });
};

const hideLangPicker = (): void => {
  if (langPicker) {
    langPicker.style.display = 'none';
  }
  activeLangAction = null;
};

const showLangPicker = (forAction: 'correct' | 'translate', anchorEl: HTMLElement): void => {
  if (!langPicker || !panel || !bubble) return;
  activeLangAction = forAction;
  const current = forAction === 'correct' ? bubbleCorrectionLanguage : bubbleTranslationLanguage;
  renderLangPicker(current);
  langPicker.style.display = 'flex';

  requestAnimationFrame(() => {
    if (!langPicker || !panel) return;
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const pickerW = langPicker.offsetWidth || 160;
    let left = anchorRect.left - panelRect.left + anchorRect.width / 2 - pickerW / 2;
    const panelW = panel.offsetWidth || 300;
    left = Math.max(4, Math.min(left, panelW - pickerW - 4));
    langPicker.style.left = `${Math.round(left)}px`;
    langPicker.style.top = `${bubble.offsetHeight + 4}px`;
  });
};

const showBubble = (
  snapshot: SelectionSnapshot,
  { preserveLanguages = false }: { preserveLanguages?: boolean } = {}
): void => {
  if (!isOrtaAvailable()) {
    ortaDebug('bubble suppressed (orta not available on page)');
    hidePanel();
    return;
  }
  if (!settings.correctionEnabled && !settings.translationEnabled) {
    ortaDebug('bubble suppressed (no actions enabled)');
    hidePanel();
    return;
  }

  cancelHideTimeout();
  currentSnapshot = snapshot;

  if (!preserveLanguages) {
    // Seed each action with its own persisted language. Picker choices are written
    // back to settings, so new selections keep the language the user last chose.
    // Internal UI clicks (lang picker) pass preserveLanguages=true to avoid the
    // brief window where storage hasn't propagated yet.
    bubbleCorrectionLanguage = normalizeTargetLanguage(settings.correctionLanguage);
    bubbleTranslationLanguage = normalizeTargetLanguage(settings.targetLanguage);
  }

  renderLabels();
  renderBubbleLanguages();
  setMode('bubble');
  positionPanel(snapshot.rect);
  ensureRootHostIsLast();
  ortaDebug('bubble shown', {
    source: snapshot.source,
    textPreview: snapshot.text.slice(0, 40),
    rect: { x: snapshot.rect.x, y: snapshot.rect.y, w: snapshot.rect.width, h: snapshot.rect.height },
  });
};

const showLoading = (action: OrtaAction, rect: DOMRect): void => {
  const copy = getContentCopy();
  const label = action === 'correct' ? copy.correctAction : copy.translateAction;
  if (loading) {
    loading.setAttribute('aria-label', label);
    loading.title = label;
  }
  setMode('loading');
  positionPanel(rect);
};

const showResult = (action: OrtaAction, text: string, rect: DOMRect, options?: { noChanges?: boolean }): void => {
  lastResultText = text;
  const copy = getContentCopy();
  if (resultTitle) {
    resultTitle.textContent = action === 'correct' ? copy.resultCorrectTitle : copy.resultTranslateTitle;
  }
  if (resultText) {
    resultText.textContent = text;
    resultText.dataset.noChanges = options?.noChanges ? 'true' : 'false';
  }
  if (noChangesBadge) noChangesBadge.textContent = copy.noChanges;
  if (copyLabel) copyLabel.textContent = copy.copyAction;
  if (resultCopy) resultCopy.classList.remove('is-done');
  setMode('result');
  positionPanel(rect);
};

const showError = (message: string, rect: DOMRect): void => {
  const copy = getContentCopy();
  if (errorTitle) errorTitle.textContent = copy.updateFailed;
  if (errorText) errorText.textContent = message || copy.noResponse;
  setMode('error');
  positionPanel(rect);
};

// ===== Transform request =====

const sendTransformRequest = (
  action: OrtaAction,
  text: string,
  overrides: { sourceLanguage?: TargetLanguageCode; targetLanguage?: TargetLanguageCode } = {}
): Promise<TransformResponse> =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'orta:transform',
          action,
          text,
          sourceLanguage: overrides.sourceLanguage,
          targetLanguage: overrides.targetLanguage,
        },
        (response: TransformResponse | undefined) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            const message = lastError.message ?? '';
            if (message.includes('context invalidated')) {
              contextValid = false;
              teardownOrphan();
            }
            resolve({ ok: false, error: message || getContentCopy().unreachable });
            return;
          }
          resolve(response ?? { ok: false, error: getContentCopy().noResponse });
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('context invalidated') || !chrome?.runtime?.id) {
        contextValid = false;
        teardownOrphan();
      }
      resolve({ ok: false, error: message || getContentCopy().unreachable });
    }
  });

const runAction = async (action: OrtaAction): Promise<void> => {
  if (!isCurrentInstance() || isProcessing || !currentSnapshot) return;
  const snapshot = currentSnapshot;
  const copy = getContentCopy();

  isProcessing = true;
  showLoading(action, snapshot.rect);

  const overrides =
    action === 'correct'
      ? { sourceLanguage: bubbleCorrectionLanguage }
      : { targetLanguage: bubbleTranslationLanguage };
  const response = await sendTransformRequest(action, snapshot.text, overrides);
  isProcessing = false;

  if (!isCurrentInstance()) return;

  if (!response.ok) {
    showError(response.error, snapshot.rect);
    return;
  }

  const noChanges = action === 'correct' && response.text.trim() === snapshot.text.trim();
  showResult(action, response.text, snapshot.rect, { noChanges });
};

// ===== Copy =====

const copyResultToClipboard = async (): Promise<void> => {
  if (!lastResultText) return;
  try {
    await navigator.clipboard.writeText(lastResultText);
  } catch {
    // clipboard.writeText can fail on some sites without user gesture or permissions —
    // fallback to a textarea + execCommand('copy').
    const fallback = document.createElement('textarea');
    fallback.value = lastResultText;
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    fallback.style.pointerEvents = 'none';
    document.body.append(fallback);
    fallback.select();
    try {
      document.execCommand('copy');
    } catch {
      /* nothing we can do */
    }
    fallback.remove();
  }

  if (!resultCopy || !copyLabel) return;
  const copy = getContentCopy();
  resultCopy.classList.add('is-done');
  copyLabel.textContent = copy.copyDone;
  if (copiedTimeout) window.clearTimeout(copiedTimeout);
  copiedTimeout = window.setTimeout(() => {
    if (!resultCopy || !copyLabel) return;
    resultCopy.classList.remove('is-done');
    copyLabel.textContent = copy.copyAction;
  }, COPIED_RESET_MS);
};

// ===== Event wiring =====

const handleSelectionChange = (() => {
  let scheduled = 0;
  return (): void => {
    if (scheduled) return;
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      if (!isCurrentInstance()) return;
      if (isProcessing || panelMode === 'loading') return;
      // Don't re-trigger the bubble while a result or error is visible — the user
      // is reading it; they can click outside to dismiss.
      if (panelMode === 'result' || panelMode === 'error') return;

      const snapshot = readActiveSelection();
      if (!snapshot) {
        // While the language picker is open, keep the bubble even if the site
        // collapsed the page selection when focus entered our shadow UI.
        if (activeLangAction) return;
        // Selection cleared; hide bubble with a small delay so quick re-selections feel smooth.
        if (!hideTimeout) {
          hideTimeout = window.setTimeout(() => {
            if (panelMode === 'bubble') hidePanel();
            hideTimeout = 0;
          }, HIDE_DELAY_MS);
        }
        return;
      }
      cancelHideTimeout();

      // If this is a re-evaluation for the exact same selected text (e.g. caused by
      // clicking our own language picker/chips inside the shadow DOM), preserve any
      // per-selection language overrides the user just chose. Only reset to global
      // when it's a genuinely new/different selection from the page.
      const isSameSelection =
        !!currentSnapshot && currentSnapshot.text.trim() === snapshot.text.trim();
      showBubble(snapshot, { preserveLanguages: isSameSelection && panelMode === 'bubble' });
    }, SELECTION_DEBOUNCE_MS);
  };
})();

if (!SKIP_FRAME) {
  document.addEventListener('selectionchange', handleSelectionChange, {
    signal: teardownController.signal,
  });

  // Polling fallback: some sites (LinkedIn) intercept selectionchange at the
  // document level with stopImmediatePropagation. We poll every 250ms and
  // detect text-selection changes by comparing serialized selection text.
  let lastPolledText = '';
  const pollSelection = () => {
    if (!isCurrentInstance()) return;
    if (isProcessing || panelMode === 'loading') return;
    if (panelMode === 'result' || panelMode === 'error') return;

    const focused = document.activeElement;
    let polled = '';
    if (isTextInput(focused)) {
      const start = focused.selectionStart ?? 0;
      const end = focused.selectionEnd ?? 0;
      if (end > start) polled = focused.value.slice(start, end);
    } else {
      polled = window.getSelection()?.toString() ?? '';
    }

    if (polled === lastPolledText) return;
    lastPolledText = polled;
    handleSelectionChange();
  };
  const pollHandle = window.setInterval(pollSelection, 250);
  teardownController.signal.addEventListener('abort', () => window.clearInterval(pollHandle));

  const isClickInsideOrtaUI = (event: Event): boolean => {
    try {
      const path = (event as any).composedPath?.() ?? [];
      return path.includes(rootHost);
    } catch {
      return false;
    }
  };

  document.addEventListener(
    'mouseup',
    (event) => {
      if (isClickInsideOrtaUI(event)) {
        // Click inside our shadow UI (e.g. language chip or picker) — do not re-evaluate
        // the page selection or reset per-bubble language choices.
        return;
      }
      handleSelectionChange();
    },
    { capture: true, signal: teardownController.signal },
  );

  // pointerup covers touch + pen + mouse uniformly; some modern sites only
  // dispatch pointer events and synthesize mouse later, or block one or the other.
  document.addEventListener(
    'pointerup',
    (event) => {
      if (isClickInsideOrtaUI(event)) {
        // Click inside our shadow UI (e.g. language chip or picker) — do not re-evaluate
        // the page selection or reset per-bubble language choices.
        return;
      }
      handleSelectionChange();
    },
    { capture: true, signal: teardownController.signal },
  );

  document.addEventListener(
    'keyup',
    (event) => {
      // Shift+arrows, Cmd+A, etc. — only check on keys that could change selection.
      if (
        event.shiftKey ||
        event.key === 'Shift' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        (event.metaKey && event.key.toLowerCase() === 'a') ||
        (event.ctrlKey && event.key.toLowerCase() === 'a')
      ) {
        handleSelectionChange();
      }
    },
    { capture: true, signal: teardownController.signal },
  );

  document.addEventListener(
    'mousedown',
    (event) => {
      // Click outside the panel — dismiss any open state.
      const path = event.composedPath();
      if (path.includes(rootHost)) return;
      if (panelMode === 'result' || panelMode === 'error') {
        hidePanel();
      }
    },
    { capture: true, signal: teardownController.signal },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && panelMode !== 'bubble') {
        hidePanel();
      }
    },
    { signal: teardownController.signal },
  );

  window.addEventListener(
    'scroll',
    () => {
      if (!currentSnapshot || panelMode === 'loading') return;
      // Re-position on scroll: read a fresh rect from current selection if available;
      // otherwise reuse the stored rect (may go off-screen but stays attached).
      const fresh = readActiveSelection();
      if (fresh) {
        currentSnapshot = fresh;
        positionPanel(fresh.rect);
      } else {
        positionPanel(currentSnapshot.rect);
      }
    },
    { capture: true, passive: true, signal: teardownController.signal },
  );

  window.addEventListener(
    'resize',
    () => {
      if (!currentSnapshot) return;
      const fresh = readActiveSelection();
      if (fresh) {
        currentSnapshot = fresh;
        positionPanel(fresh.rect);
      }
    },
    { passive: true, signal: teardownController.signal },
  );

  window.addEventListener(
    'pagehide',
    () => {
      teardownController.abort();
    },
    { signal: teardownController.signal },
  );
}

// Bubble interactions — click runs action; long-press opens language picker
const bindBubbleAction = (
  btn: HTMLButtonElement | null,
  action: 'correct' | 'translate',
): void => {
  if (!btn) return;

  let pressTimer = 0;
  let didLongPress = false;

  const clearPress = (): void => {
    if (pressTimer) {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
    }
  };

  btn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    didLongPress = false;
    clearPress();
    pressTimer = window.setTimeout(() => {
      didLongPress = true;
      if (activeLangAction === action && langPicker && langPicker.style.display !== 'none') {
        hideLangPicker();
      } else {
        showLangPicker(action, btn);
      }
    }, BUBBLE_LONG_PRESS_MS);
  });

  btn.addEventListener('pointerup', clearPress);
  btn.addEventListener('pointerleave', clearPress);
  btn.addEventListener('pointercancel', clearPress);

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (didLongPress) {
      didLongPress = false;
      return;
    }
    const wasPickerOpen = !!(langPicker && langPicker.style.display !== 'none');
    hideLangPicker();
    if (wasPickerOpen) return;
    void runAction(action);
  });
};

bindBubbleAction(correctBtn, 'correct');
bindBubbleAction(translateBtn, 'translate');

// Dismiss open language picker on clicks elsewhere in the panel (keeps it non-intrusive)
panel?.addEventListener('click', (event) => {
  if (!langPicker || langPicker.style.display === 'none') return;
  const target = event.target as Node | null;
  if (target && !langPicker.contains(target)) {
    hideLangPicker();
  }
});

resultCopy?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  void copyResultToClipboard();
});

resultClose?.addEventListener('click', () => hidePanel());
errorClose?.addEventListener('click', () => hidePanel());

// Settings sync
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isCurrentInstance()) return;

  if (areaName === 'sync') {
    settings = {
      ...settings,
      enabled: changes.enabled?.newValue ?? settings.enabled,
      correctionEnabled: changes.correctionEnabled?.newValue ?? settings.correctionEnabled,
      translationEnabled: changes.translationEnabled?.newValue ?? settings.translationEnabled,
      targetLanguage: changes.targetLanguage?.newValue ?? settings.targetLanguage,
      correctionLanguage: changes.correctionLanguage?.newValue ?? settings.correctionLanguage,
      appLanguage: changes.appLanguage?.newValue ?? settings.appLanguage,
    };
    renderLabels();
    renderBubbleLanguages();
    if (!isOrtaAvailable()) hidePanel();
    return;
  }

  if (areaName === 'local' && changes.disabledSites) {
    settings = {
      ...settings,
      disabledSites: changes.disabledSites.newValue ?? settings.disabledSites,
    };
    if (!isOrtaAvailable()) hidePanel();
  }
});

// Keyboard shortcuts: act on the current selection.
chrome.runtime.onMessage.addListener((message: ContentScriptCommand) => {
  if (!isCurrentInstance() || message?.type !== CONTENT_SCRIPT_COMMAND_TYPE) return false;
  const snapshot = readActiveSelection();
  if (!snapshot) return false;
  currentSnapshot = snapshot;
  showBubble(snapshot);
  void runAction(message.action);
  return false;
});

// Initial settings load
void getPublicSettings()
  .catch((error) => {
    console.warn('[orta] failed to load settings, using defaults', error);
    return publicDefaults;
  })
  .then((stored) => {
    if (!isCurrentInstance()) return;
    settings = stored;
    bubbleCorrectionLanguage = normalizeTargetLanguage(settings.correctionLanguage);
    bubbleTranslationLanguage = normalizeTargetLanguage(settings.targetLanguage);
    renderLabels();
    renderBubbleLanguages();
    ortaDebug('content script ready', {
      href: window.location.href,
      topFrame: window.top === window,
      available: isOrtaAvailable(),
    });
  });
