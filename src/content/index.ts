import { getCopy, type CopyDictionary } from '../shared/i18n';
import {
  getPublicSettings,
  publicDefaults,
  setPublicSettings,
  type PublicOrtaSettings,
} from '../shared/settings';
import {
  getTargetLanguageLabel,
  normalizeTargetLanguage,
  TARGET_LANGUAGE_REGISTRY,
  type TargetLanguageCode,
} from '../shared/languages';
import { normalizeAppLanguage } from '../shared/appLanguage';
import { isOrtaAvailableForUrl } from '../shared/sites';
import { isPageSafeForOrta } from '../shared/pageGuard';
import { diffWords, hasChanges } from '../shared/diff';
import { ORTA_SPARK_MARKUP } from '../shared/ortaGlyph';
import {
  CONTENT_SCRIPT_COMMAND_TYPE,
  MAX_SELECTION_CHARS,
  TRANSFORM_PORT_NAME,
  type ContentScriptCommand,
  type OrtaAction,
  type TransformErrorCode,
  type TransformPortMessage,
  type TransformStart,
} from '../shared/messages';
import { CONTENT_STYLES } from './styles';
import {
  canReplace,
  getSelectionFingerprint,
  isSameTarget,
  measureTarget,
  readSelection,
  replaceTarget,
  type SelectionTarget,
} from './selection';

type OrtaWindow = Window & typeof globalThis & { __ortaContentInstanceId?: string };
type Mode = 'hidden' | 'bubble' | 'working' | 'result' | 'error';
type Dock = 'left' | 'top' | 'above' | 'below';

const ROOT_TAG = 'orta-root';
const SELECTION_DEBOUNCE_MS = 90;
const HIDE_DELAY_MS = 120;
const POLL_INTERVAL_MS = 400;
const GAP = 6;
const VIEWPORT_MARGIN = 8;
/** Room the expanded bubble needs to the left of the selection. */
const BUBBLE_EXPANDED_WIDTH = 190;
const CARD_EXPECTED_HEIGHT = 220;
const COPIED_RESET_MS = 1600;
const LONG_PRESS_MS = 400;
const INSTANCE_ID = crypto.randomUUID();

const RETRYABLE_CODES = new Set<TransformErrorCode>(['network', 'noOutput', 'rateLimited', 'server', 'timeout', 'unknown']);
const SETTINGS_CODES = new Set<TransformErrorCode>(['apiKeyMissing', 'auth', 'modelUnavailable']);

const ICONS = {
  correct:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 6 3 3"/></svg>',
  translate:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m14 22 5-10 5 10"/><path d="M15.5 18h7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  replace:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 14-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>',
  retry:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
};

// ===== State =====

let settings: PublicOrtaSettings = publicDefaults;
let settingsLoaded = false;
let mode: Mode = 'hidden';
let dock: Dock = 'left';
let target: SelectionTarget | null = null;
let activeAction: OrtaAction = 'correct';
let activePort: chrome.runtime.Port | null = null;
let requestId = 0;
let resultText = '';
let lastErrorCode: TransformErrorCode | null = null;
let showDiff = true;
let isPointerSelecting = false;
let contextValid = true;
let teardownDone = false;
let hideTimer = 0;
let copiedTimer = 0;
let repositionRaf = 0;
let pickerAction: OrtaAction | null = null;
let bubbleLanguages: Record<OrtaAction, TargetLanguageCode> = {
  correct: normalizeTargetLanguage(publicDefaults.correctionLanguage),
  translate: normalizeTargetLanguage(publicDefaults.targetLanguage),
};
const teardownController = new AbortController();
const { signal } = teardownController;

const ortaDebug = (...args: unknown[]): void => {
  try {
    if (localStorage.getItem('ortaDebug') === '1') console.log('[orta]', ...args);
  } catch {
    /* localStorage blocked */
  }
};

const copy = (): CopyDictionary => getCopy(settings.appLanguage);
const appLanguage = () => normalizeAppLanguage(settings.appLanguage);

// ===== Frame / lifecycle guards =====

const shouldSkipFrame = (): boolean => {
  try {
    // Google Docs/Slides render text on canvas; selection there isn't real text.
    if (document.querySelector('.kix-appview, .punch-viewmode, .docs-texteventtarget-iframe')) return true;
  } catch {
    return true;
  }
  if (window.top !== window) {
    let frameElement: Element | null = null;
    try {
      frameElement = window.frameElement;
    } catch {
      /* cross-origin frame element access denied */
    }
    if (frameElement instanceof HTMLIFrameElement) {
      const sandbox = frameElement.getAttribute('sandbox');
      if (sandbox !== null && !/\ballow-same-origin\b/i.test(sandbox)) return true;
    }
    if (window.location.href === 'about:blank' && !document.body) return true;
  }
  return false;
};

const SKIP_FRAME = shouldSkipFrame();

const rootHost = document.createElement(ROOT_TAG);

const teardown = (): void => {
  if (teardownDone) return;
  teardownDone = true;
  contextValid = false;
  activePort?.disconnect();
  teardownController.abort();
  rootHost.remove();
};

const isContextValid = (): boolean => {
  if (!contextValid) return false;
  try {
    if (chrome?.runtime?.id) return true;
  } catch {
    /* extension reloaded */
  }
  teardown();
  return false;
};

if (!SKIP_FRAME) {
  (window as OrtaWindow).__ortaContentInstanceId = INSTANCE_ID;
  // A reloaded extension leaves the previous instance's root behind.
  document.querySelectorAll(ROOT_TAG).forEach((element) => element.remove());
}

const isCurrentInstance = (): boolean =>
  !SKIP_FRAME && isContextValid() && (window as OrtaWindow).__ortaContentInstanceId === INSTANCE_ID;

const isEnabledForPage = (): boolean => settingsLoaded && isOrtaAvailableForUrl(window.location.href, settings);

// ===== Shadow DOM shell =====

/*
 * The host is a manual popover so the UI renders in the browser's top layer:
 * above every z-index on the page and unaffected by transformed or clipped
 * ancestors. Inline !important styles neutralise the UA popover box.
 */
const HOST_STYLE: Record<string, string> = {
  position: 'fixed',
  inset: '0 auto auto 0',
  width: '0',
  height: '0',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
  'pointer-events': 'none',
  'z-index': '2147483647',
};
for (const [property, value] of Object.entries(HOST_STYLE)) {
  rootHost.style.setProperty(property, value, 'important');
}
rootHost.setAttribute('popover', 'manual');

const shadowRoot = rootHost.attachShadow({ mode: 'closed' });
shadowRoot.innerHTML = `
  <style>${CONTENT_STYLES}</style>
  <div class="panel" id="panel">
    <div class="bubble" id="bubble" role="toolbar">
      <div class="bubble-actions" id="bubble-actions">
        <div class="action-group" data-group="correct">
          <button class="action-main" data-run="correct" type="button">${ICONS.correct}</button>
          <button class="action-lang" data-lang="correct" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
        </div>
        <div class="action-group" data-group="translate">
          <button class="action-main" data-run="translate" type="button">${ICONS.translate}</button>
          <button class="action-lang" data-lang="translate" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
        </div>
      </div>
      <button class="bubble-handle" id="bubble-handle" type="button" aria-expanded="false">${ORTA_SPARK_MARKUP}</button>
      <div class="lang-picker" id="lang-picker" role="listbox"></div>
    </div>
    <section class="card" id="card" aria-live="polite">
      <header class="card-header">
        <span class="card-title" id="card-title"></span>
        <span class="card-meta" id="card-meta"></span>
        <button class="icon-button" id="card-close" type="button">${ICONS.close}</button>
      </header>
      <div class="card-body" id="card-body"></div>
      <footer class="card-footer" id="card-footer">
        <span class="status-badge" id="no-changes" hidden>${ICONS.check}<span id="no-changes-label"></span></span>
        <button class="btn btn-ghost btn-start" id="diff-toggle" type="button" hidden></button>
        <button class="btn btn-ghost" id="cancel" type="button" hidden></button>
        <button class="btn btn-ghost" id="open-settings" type="button" hidden>${ICONS.settings}<span></span></button>
        <button class="btn btn-icon" id="retry" type="button" hidden>${ICONS.retry}</button>
        <button class="btn" id="replace" type="button" hidden>${ICONS.replace}<span></span></button>
        <button class="btn btn-primary" id="copy" type="button" hidden>${ICONS.copy}<span></span></button>
      </footer>
    </section>
  </div>
`;

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = shadowRoot.querySelector<T>(selector);
  if (!element) throw new Error(`[orta] missing ${selector}`);
  return element;
};

const panel = $<HTMLDivElement>('#panel');
const bubble = $<HTMLDivElement>('#bubble');
const bubbleHandle = $<HTMLButtonElement>('#bubble-handle');
const langPicker = $<HTMLDivElement>('#lang-picker');
const card = $<HTMLElement>('#card');
const cardTitle = $<HTMLSpanElement>('#card-title');
const cardMeta = $<HTMLSpanElement>('#card-meta');
const cardBody = $<HTMLDivElement>('#card-body');
const cardClose = $<HTMLButtonElement>('#card-close');
const noChangesBadge = $<HTMLSpanElement>('#no-changes');
const noChangesLabel = $<HTMLSpanElement>('#no-changes-label');
const diffToggle = $<HTMLButtonElement>('#diff-toggle');
const cancelButton = $<HTMLButtonElement>('#cancel');
const openSettingsButton = $<HTMLButtonElement>('#open-settings');
const retryButton = $<HTMLButtonElement>('#retry');
const replaceButton = $<HTMLButtonElement>('#replace');
const copyButton = $<HTMLButtonElement>('#copy');
const runButtons = {
  correct: $<HTMLButtonElement>('[data-run="correct"]'),
  translate: $<HTMLButtonElement>('[data-run="translate"]'),
};
const langButtons = {
  correct: $<HTMLButtonElement>('[data-lang="correct"]'),
  translate: $<HTMLButtonElement>('[data-lang="translate"]'),
};
const actionGroups = {
  correct: $<HTMLDivElement>('[data-group="correct"]'),
  translate: $<HTMLDivElement>('[data-group="translate"]'),
};

const setButtonLabel = (button: HTMLButtonElement, label: string): void => {
  const span = button.querySelector('span');
  if (span) span.textContent = label;
  else button.textContent = label;
};

const languageCode = (code: TargetLanguageCode): string => code.split('-')[0]?.toUpperCase() ?? code;

// ===== Mounting / visibility =====

const mount = (): void => {
  if (!rootHost.isConnected) document.documentElement.append(rootHost);
};

/** Shows the host in the top layer, re-raising it above anything opened since. */
const raiseHost = (): void => {
  mount();
  try {
    if (rootHost.matches(':popover-open')) rootHost.hidePopover();
    rootHost.showPopover();
  } catch {
    /* popover unsupported or host detached: z-index fallback still applies */
  }
};

const lowerHost = (): void => {
  try {
    if (rootHost.matches(':popover-open')) rootHost.hidePopover();
  } catch {
    /* ignore */
  }
};

// ===== Labels =====

const renderStaticLabels = (): void => {
  const c = copy();
  const app = appLanguage();
  bubble.setAttribute('aria-label', c.actionsLabel);
  bubbleHandle.setAttribute('aria-label', c.openLabel);
  bubbleHandle.title = 'Orta';
  cardClose.setAttribute('aria-label', c.closeLabel);
  cardClose.title = c.closeLabel;
  setButtonLabel(cancelButton, c.cancelAction);
  setButtonLabel(openSettingsButton, c.openSettingsAction);
  retryButton.setAttribute('aria-label', c.retryAction);
  retryButton.title = c.retryAction;
  setButtonLabel(replaceButton, c.replaceAction);
  setButtonLabel(copyButton, c.copyAction);
  noChangesLabel.textContent = c.noChanges;

  for (const action of ['correct', 'translate'] as const) {
    const code = bubbleLanguages[action];
    const languageLabel = getTargetLanguageLabel(code, app);
    const actionLabel = action === 'correct' ? c.correctAction : c.translateAction;
    runButtons[action].setAttribute('aria-label', `${actionLabel} (${languageLabel})`);
    runButtons[action].title = `${actionLabel} · ${languageLabel}`;
    langButtons[action].textContent = languageCode(code);
    langButtons[action].setAttribute('aria-label', `${c.changeLanguage}: ${languageLabel}`);
    langButtons[action].title = `${c.changeLanguage} · ${languageLabel}`;
  }

  actionGroups.correct.hidden = !settings.correctionEnabled;
  actionGroups.translate.hidden = !settings.translationEnabled;
};

// ===== Positioning =====

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

const positionPanel = (): void => {
  if (!target || mode === 'hidden') return;
  const rects = measureTarget(target);
  if (!rects) {
    if (mode === 'bubble') hideAll();
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left: number;
  let top: number;

  if (mode === 'bubble') {
    const anchor = rects.first;
    // Dock left of the first line; if there's no room for the expanded actions,
    // sit above the line's start and grow rightwards instead.
    dock = anchor.left - GAP - BUBBLE_EXPANDED_WIDTH >= VIEWPORT_MARGIN ? 'left' : 'top';
    if (dock === 'left') {
      left = anchor.left - GAP;
      top = clamp(anchor.top + anchor.height / 2, VIEWPORT_MARGIN + 11, vh - VIEWPORT_MARGIN - 11);
    } else {
      left = clamp(anchor.left, VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - BUBBLE_EXPANDED_WIDTH);
      top = clamp(anchor.top - GAP, VIEWPORT_MARGIN + 26, vh - VIEWPORT_MARGIN);
    }
  } else {
    const bounds = rects.bounds;
    const cardWidth = card.offsetWidth || 320;
    const spaceAbove = bounds.top - GAP - VIEWPORT_MARGIN;
    const spaceBelow = vh - bounds.bottom - GAP - VIEWPORT_MARGIN;
    // Keep the dock stable while a card is open so streaming text doesn't flip it.
    if (panel.dataset.visible !== 'true' || (dock !== 'above' && dock !== 'below')) {
      dock = spaceAbove >= CARD_EXPECTED_HEIGHT || spaceAbove > spaceBelow ? 'above' : 'below';
    }
    left = clamp(bounds.left, VIEWPORT_MARGIN, vw - cardWidth - VIEWPORT_MARGIN);
    if (dock === 'above') {
      top = clamp(bounds.top - GAP, VIEWPORT_MARGIN + 120, vh - VIEWPORT_MARGIN);
    } else {
      top = clamp(bounds.bottom + GAP, VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - 120);
    }
    const available = dock === 'above' ? top - VIEWPORT_MARGIN : vh - top - VIEWPORT_MARGIN;
    // Header + footer + padding take ~100px; the body scrolls inside the rest.
    panel.style.setProperty('--orta-body-max', `${clamp(available - 100, 72, 320)}px`);
  }

  panel.dataset.dock = dock;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
};

const schedulePosition = (): void => {
  if (repositionRaf) return;
  repositionRaf = requestAnimationFrame(() => {
    repositionRaf = 0;
    positionPanel();
  });
};

const showPanel = (animate: boolean): void => {
  const wasVisible = panel.dataset.visible === 'true';
  if (!wasVisible) raiseHost();
  panel.dataset.visible = 'true';
  positionPanel();
  if (animate && !wasVisible) {
    panel.dataset.animate = 'true';
    window.setTimeout(() => delete panel.dataset.animate, 240);
  }
};

const setInteractive = (interactive: boolean): void => {
  if (interactive) delete panel.dataset.inert;
  else panel.dataset.inert = 'true';
};

const setBubbleExpanded = (expanded: boolean): void => {
  if (expanded) bubble.dataset.expanded = 'true';
  else delete bubble.dataset.expanded;
  bubbleHandle.setAttribute('aria-expanded', String(expanded));
};

const setMode = (next: Mode): void => {
  mode = next;
  bubble.hidden = next !== 'bubble';
  card.hidden = next === 'hidden' || next === 'bubble';
  if (next !== 'bubble') closeLangPicker();
  if (next !== 'working') cardBody.removeAttribute('aria-busy');
};

const cancelRequest = (): void => {
  requestId += 1;
  if (activePort) {
    const port = activePort;
    activePort = null;
    try {
      port.disconnect();
    } catch {
      /* already closed */
    }
  }
};

function hideAll(): void {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  cancelRequest();
  setMode('hidden');
  setBubbleExpanded(false);
  panel.dataset.visible = 'false';
  delete panel.dataset.inert;
  target = null;
  lowerHost();
}

// ===== Language picker =====

const renderLangPicker = (action: OrtaAction): void => {
  const app = appLanguage();
  const c = copy();
  const current = bubbleLanguages[action];
  langPicker.replaceChildren();
  langPicker.setAttribute('aria-label', action === 'correct' ? c.correctionLanguageLabel : c.translationLanguageLabel);

  const title = document.createElement('div');
  title.className = 'lang-picker-title';
  title.textContent = action === 'correct' ? c.correctionLanguageLabel : c.translationLanguageLabel;
  title.setAttribute('aria-hidden', 'true');
  langPicker.append(title);

  for (const entry of TARGET_LANGUAGE_REGISTRY) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lang-option';
    option.setAttribute('role', 'option');
    option.dataset.code = entry.code;
    const selected = entry.code === current;
    option.setAttribute('aria-selected', String(selected));
    option.tabIndex = selected ? 0 : -1;

    const codeLabel = document.createElement('span');
    codeLabel.className = 'lang-code';
    codeLabel.textContent = languageCode(entry.code);
    const name = document.createElement('span');
    name.className = 'lang-name';
    name.textContent = getTargetLanguageLabel(entry.code, app);
    option.append(codeLabel, name);
    langPicker.append(option);
  }
};

const openLangPicker = (action: OrtaAction, { focus }: { focus: boolean }): void => {
  pickerAction = action;
  setBubbleExpanded(true);
  renderLangPicker(action);
  langPicker.dataset.open = 'true';
  langButtons.correct.setAttribute('aria-expanded', String(action === 'correct'));
  langButtons.translate.setAttribute('aria-expanded', String(action === 'translate'));
  if (focus) langPicker.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
};

function closeLangPicker({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void {
  const action = pickerAction;
  pickerAction = null;
  delete langPicker.dataset.open;
  langButtons.correct.setAttribute('aria-expanded', 'false');
  langButtons.translate.setAttribute('aria-expanded', 'false');
  if (restoreFocus && action) langButtons[action].focus();
}

const chooseLanguage = (code: TargetLanguageCode): void => {
  const action = pickerAction;
  if (!action) return;
  bubbleLanguages = { ...bubbleLanguages, [action]: code };
  const patch = action === 'correct' ? { correctionLanguage: code } : { targetLanguage: code };
  // Update memory first so the next selection already uses the new choice.
  settings = { ...settings, ...patch };
  void setPublicSettings(patch).catch((error) => ortaDebug('failed to persist language', error));
  renderStaticLabels();
  closeLangPicker({ restoreFocus: shadowRoot.activeElement !== null });
};

langPicker.addEventListener('pointerdown', (event) => event.preventDefault());
langPicker.addEventListener('click', (event) => {
  const option = (event.target as Element).closest<HTMLButtonElement>('.lang-option');
  if (!option?.dataset.code) return;
  event.stopPropagation();
  chooseLanguage(normalizeTargetLanguage(option.dataset.code));
});
langPicker.addEventListener('keydown', (event) => {
  const options = Array.from(langPicker.querySelectorAll<HTMLButtonElement>('.lang-option'));
  const index = options.indexOf(shadowRoot.activeElement as HTMLButtonElement);
  const move = (next: number) => {
    const option = options[(next + options.length) % options.length];
    options.forEach((candidate) => (candidate.tabIndex = -1));
    if (option) {
      option.tabIndex = 0;
      option.focus();
    }
  };
  switch (event.key) {
    case 'ArrowDown':
      move(index + 2);
      break;
    case 'ArrowUp':
      move(index - 2);
      break;
    case 'ArrowRight':
      move(index + 1);
      break;
    case 'ArrowLeft':
      move(index - 1);
      break;
    case 'Home':
      move(0);
      break;
    case 'End':
      move(options.length - 1);
      break;
    case 'Escape':
      closeLangPicker({ restoreFocus: true });
      break;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
});

// ===== Bubble =====

const showBubble = (next: SelectionTarget, { interactive }: { interactive: boolean }): void => {
  if (!isEnabledForPage() || !isPageSafeForOrta(window.location.href)) {
    if (mode !== 'hidden') hideAll();
    return;
  }

  window.clearTimeout(hideTimer);
  hideTimer = 0;
  const wasBubble = mode === 'bubble' && panel.dataset.visible === 'true';
  const sameSelection = isSameTarget(target, next);
  target = next;
  setInteractive(interactive);

  if (wasBubble) {
    // Same gesture growing/shrinking, or a re-read of the same selection: just move.
    if (!sameSelection && !isPointerSelecting) {
      setBubbleExpanded(false);
      closeLangPicker();
    }
    schedulePosition();
    return;
  }

  bubbleLanguages = {
    correct: normalizeTargetLanguage(settings.correctionLanguage),
    translate: normalizeTargetLanguage(settings.targetLanguage),
  };
  renderStaticLabels();
  setBubbleExpanded(false);
  setMode('bubble');
  showPanel(!isPointerSelecting);
  ortaDebug('bubble shown', { kind: next.kind, preview: next.text.slice(0, 40) });
};

// ===== Card rendering =====

const resetCardFooter = (): void => {
  for (const element of [noChangesBadge, diffToggle, cancelButton, openSettingsButton, retryButton, replaceButton, copyButton]) {
    element.hidden = true;
  }
  delete card.dataset.noChanges;
  delete replaceButton.dataset.done;
  delete copyButton.dataset.done;
  replaceButton.disabled = false;
};

const actionMeta = (action: OrtaAction): string => {
  const code = bubbleLanguages[action];
  return getTargetLanguageLabel(code, appLanguage());
};

const renderWorking = (action: OrtaAction): void => {
  const c = copy();
  resetCardFooter();
  card.dataset.state = 'working';
  cardTitle.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  cardTitle.append(action === 'correct' ? c.workingCorrect : c.workingTranslate);
  cardMeta.textContent = actionMeta(action);
  cardBody.setAttribute('aria-busy', 'true');
  cardBody.innerHTML = '<div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>';
  cancelButton.hidden = false;
};

const renderStreamingText = (text: string): void => {
  cardBody.textContent = text;
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  cardBody.append(caret);
  cardBody.scrollTop = cardBody.scrollHeight;
  schedulePosition();
};

const renderResultBody = (): void => {
  const original = target?.text ?? '';
  const segments = activeAction === 'correct' && showDiff ? diffWords(original, resultText) : null;
  if (!segments || !hasChanges(segments)) {
    cardBody.textContent = resultText;
    return;
  }
  cardBody.replaceChildren(
    ...segments.map((segment) => {
      if (segment.type === 'equal') return document.createTextNode(segment.text);
      const element = document.createElement(segment.type === 'insert' ? 'ins' : 'del');
      element.textContent = segment.text;
      return element;
    }),
  );
};

const renderResult = (text: string): void => {
  const c = copy();
  resultText = text;
  resetCardFooter();
  card.dataset.state = 'result';
  cardTitle.textContent = activeAction === 'correct' ? c.resultCorrectTitle : c.resultTranslateTitle;
  cardMeta.textContent = actionMeta(activeAction);

  const original = target?.text ?? '';
  const unchanged = activeAction === 'correct' && text.trim() === original.trim();
  if (unchanged) {
    card.dataset.noChanges = 'true';
    noChangesBadge.hidden = false;
  }

  const diffAvailable = activeAction === 'correct' && !unchanged && hasChanges(diffWords(original, text));
  diffToggle.hidden = !diffAvailable;
  diffToggle.textContent = showDiff ? c.hideChanges : c.showChanges;
  diffToggle.setAttribute('aria-pressed', String(showDiff));

  renderResultBody();
  retryButton.hidden = false;
  replaceButton.hidden = unchanged || !target || !canReplace(target);
  copyButton.hidden = false;
  schedulePosition();
};

const renderError = (message: string, code: TransformErrorCode): void => {
  const c = copy();
  lastErrorCode = code;
  resetCardFooter();
  card.dataset.state = 'error';
  cardTitle.textContent = c.updateFailed;
  cardMeta.textContent = '';
  cardBody.textContent = message || c.noResponse;
  openSettingsButton.hidden = !SETTINGS_CODES.has(code);
  retryButton.hidden = !RETRYABLE_CODES.has(code);
  schedulePosition();
};

// ===== Transform =====

const runAction = (action: OrtaAction): void => {
  if (!isCurrentInstance() || !target) return;
  const requestTarget = target;
  cancelRequest();
  const id = requestId;
  activeAction = action;
  resultText = '';
  lastErrorCode = null;

  // Fix the card width up front so streamed text never makes it (and its
  // buttons) jump sideways. Wider selections get a wider card.
  const selectionWidth = measureTarget(requestTarget)?.bounds.width ?? 0;
  card.style.width = `${Math.round(clamp(selectionWidth, 340, Math.min(420, window.innerWidth - 2 * VIEWPORT_MARGIN)))}px`;

  setMode('working');
  renderWorking(action);
  setInteractive(true);
  // Forget the previous dock so the card picks above/below for this selection.
  dock = 'left';
  panel.dataset.visible = 'false';
  showPanel(true);

  if (requestTarget.text.length > MAX_SELECTION_CHARS) {
    setMode('error');
    renderError(copy().textTooLong.replace('{max}', MAX_SELECTION_CHARS.toLocaleString()), 'tooLong');
    return;
  }

  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: TRANSFORM_PORT_NAME });
  } catch (error) {
    ortaDebug('connect failed', error);
    if (!isContextValid()) return;
    setMode('error');
    renderError(copy().unreachable, 'network');
    return;
  }
  activePort = port;
  let finished = false;

  port.onMessage.addListener((message: TransformPortMessage) => {
    if (id !== requestId) return;
    if (message.type === 'delta') {
      renderStreamingText(message.text);
      return;
    }
    finished = true;
    activePort = null;
    port.disconnect();
    if (message.type === 'done') {
      setMode('result');
      renderResult(message.text);
    } else {
      setMode('error');
      renderError(message.error, message.code);
    }
  });

  port.onDisconnect.addListener(() => {
    const lastError = chrome.runtime.lastError?.message ?? '';
    if (id !== requestId || finished) return;
    activePort = null;
    if (lastError.includes('context invalidated') || !isContextValid()) {
      teardown();
      return;
    }
    setMode('error');
    renderError(copy().unreachable, 'network');
  });

  const start: TransformStart = {
    type: 'start',
    action,
    text: requestTarget.text,
    ...(action === 'correct'
      ? { sourceLanguage: bubbleLanguages.correct }
      : { targetLanguage: bubbleLanguages.translate }),
  };
  port.postMessage(start);
};

// ===== Card actions =====

const flashDone = (button: HTMLButtonElement, label: string, resetLabel: string): void => {
  button.dataset.done = 'true';
  setButtonLabel(button, label);
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    delete button.dataset.done;
    setButtonLabel(button, resetLabel);
  }, COPIED_RESET_MS);
};

const copyResult = async (): Promise<void> => {
  if (!resultText) return;
  try {
    await navigator.clipboard.writeText(resultText);
  } catch {
    // Some pages block the async clipboard API; fall back to a hidden textarea.
    const fallback = document.createElement('textarea');
    fallback.value = resultText;
    fallback.setAttribute('readonly', '');
    fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0;';
    document.documentElement.append(fallback);
    fallback.select();
    try {
      document.execCommand('copy');
    } catch {
      /* nothing else to try */
    }
    fallback.remove();
  }
  const c = copy();
  flashDone(copyButton, c.copyDone, c.copyAction);
};

const replaceResult = (): void => {
  if (!target || !resultText) return;
  const c = copy();
  const replaced = replaceTarget(target, resultText);
  if (!replaced) {
    replaceButton.disabled = true;
    setButtonLabel(replaceButton, c.replaceFailed);
    return;
  }
  flashDone(replaceButton, c.replaceDone, c.replaceAction);
  replaceButton.disabled = true;
  // The text under the original selection is gone; close once the user sees the confirmation.
  window.setTimeout(() => {
    if (mode === 'result') hideAll();
  }, 700);
};

// Buttons never take focus on mouse press, so the page keeps its selection/caret.
panel.addEventListener('pointerdown', (event) => {
  const element = event.target as Element;
  if (element.closest('button') && !element.closest('.lang-option')) event.preventDefault();
});

copyButton.addEventListener('click', () => void copyResult());
replaceButton.addEventListener('click', replaceResult);
retryButton.addEventListener('click', () => runAction(activeAction));
cancelButton.addEventListener('click', hideAll);
cardClose.addEventListener('click', hideAll);
openSettingsButton.addEventListener('click', () => {
  try {
    void chrome.runtime.sendMessage({ type: 'orta:openOptions' }).catch(() => undefined);
  } catch {
    isContextValid();
  }
});
diffToggle.addEventListener('click', () => {
  showDiff = !showDiff;
  const c = copy();
  diffToggle.textContent = showDiff ? c.hideChanges : c.showChanges;
  diffToggle.setAttribute('aria-pressed', String(showDiff));
  renderResultBody();
});

// Bubble actions: click runs; long-press (or the language chip) opens the picker.
for (const action of ['correct', 'translate'] as const) {
  const button = runButtons[action];
  let pressTimer = 0;
  let longPressed = false;

  button.addEventListener('pointerdown', () => {
    longPressed = false;
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      openLangPicker(action, { focus: false });
    }, LONG_PRESS_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    button.addEventListener(type, () => window.clearTimeout(pressTimer));
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (longPressed) {
      longPressed = false;
      return;
    }
    closeLangPicker();
    runAction(action);
  });

  langButtons[action].addEventListener('click', (event) => {
    event.stopPropagation();
    if (pickerAction === action) {
      closeLangPicker();
      return;
    }
    // detail === 0 means keyboard activation: move focus into the list.
    openLangPicker(action, { focus: event.detail === 0 });
  });
}

bubbleHandle.addEventListener('click', (event) => {
  event.stopPropagation();
  const expanded = bubble.dataset.expanded !== 'true';
  setBubbleExpanded(expanded);
  if (!expanded) closeLangPicker();
});

panel.addEventListener('click', (event) => {
  if (pickerAction && !(event.target as Element).closest('.lang-picker, .action-lang')) closeLangPicker();
});

// ===== Selection tracking =====

const evaluateSelection = (): void => {
  if (!isCurrentInstance() || !isEnabledForPage()) return;
  // A working/result/error card stays until dismissed: the user is reading it.
  if (mode === 'working' || mode === 'result' || mode === 'error') return;

  const next = readSelection();
  if (!next) {
    if (pickerAction || mode === 'hidden') return;
    if (isPointerSelecting) {
      hideAll();
      return;
    }
    if (!hideTimer) {
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        if (mode === 'bubble') hideAll();
      }, HIDE_DELAY_MS);
    }
    return;
  }

  showBubble(next, { interactive: !isPointerSelecting });
};

const scheduleEvaluate = (() => {
  let timer = 0;
  return (): void => {
    if (timer) return;
    timer = window.setTimeout(
      () => {
        timer = 0;
        evaluateSelection();
      },
      isPointerSelecting ? 0 : SELECTION_DEBOUNCE_MS,
    );
  };
})();

const isEventFromOrta = (event: Event): boolean => event.composedPath().includes(rootHost);

if (!SKIP_FRAME) {
  let sawNativeSelectionChange = false;
  let lastFingerprint = '';

  // Window capture runs before page listeners on document, so sites that call
  // stopImmediatePropagation on selectionchange (e.g. LinkedIn) can't hide it.
  window.addEventListener(
    'selectionchange',
    () => {
      sawNativeSelectionChange = true;
      scheduleEvaluate();
    },
    { capture: true, signal },
  );

  // Last-resort poll, only until a native selectionchange proves events work.
  const pollHandle = window.setInterval(() => {
    if (sawNativeSelectionChange) {
      window.clearInterval(pollHandle);
      return;
    }
    if (document.visibilityState !== 'visible' || !document.hasFocus() || !isEnabledForPage()) return;
    const fingerprint = getSelectionFingerprint();
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    scheduleEvaluate();
  }, POLL_INTERVAL_MS);
  signal.addEventListener('abort', () => window.clearInterval(pollHandle));

  window.addEventListener(
    'pointerdown',
    (event) => {
      if (isEventFromOrta(event)) return;
      if (mode === 'working' || mode === 'result' || mode === 'error') {
        hideAll(); // click outside dismisses the card
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      isPointerSelecting = true;
      if (mode === 'bubble') setInteractive(false);
    },
    { capture: true, signal },
  );

  const endPointerSelection = (event: PointerEvent): void => {
    if (isEventFromOrta(event) || !isPointerSelecting) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    isPointerSelecting = false;
    scheduleEvaluate();
    window.setTimeout(() => {
      if (!isPointerSelecting && mode === 'bubble') setInteractive(true);
    }, 0);
  };
  window.addEventListener('pointerup', endPointerSelection, { capture: true, signal });
  window.addEventListener('pointercancel', endPointerSelection, { capture: true, signal });

  window.addEventListener(
    'keyup',
    (event) => {
      if (isEventFromOrta(event)) return;
      const key = event.key;
      if (
        event.shiftKey ||
        key === 'Shift' ||
        key.startsWith('Arrow') ||
        key === 'Home' ||
        key === 'End' ||
        ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'a')
      ) {
        scheduleEvaluate();
      }
    },
    { capture: true, signal },
  );

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || mode === 'hidden') return;
      if (pickerAction) {
        closeLangPicker({ restoreFocus: true });
        return;
      }
      hideAll();
    },
    { signal },
  );

  window.addEventListener('scroll', schedulePosition, { capture: true, passive: true, signal });
  window.addEventListener('resize', schedulePosition, { passive: true, signal });
  window.addEventListener('pagehide', teardown, { signal });
}

// ===== Settings & commands =====

const applySettings = (next: PublicOrtaSettings): void => {
  settings = next;
  settingsLoaded = true;
  if (mode === 'bubble' || mode === 'hidden') {
    bubbleLanguages = {
      correct: normalizeTargetLanguage(settings.correctionLanguage),
      translate: normalizeTargetLanguage(settings.targetLanguage),
    };
  }
  renderStaticLabels();
  if (!isEnabledForPage() && mode !== 'hidden') hideAll();
};

const loadSettings = (): Promise<void> =>
  getPublicSettings()
    .catch((error) => {
      console.warn('[orta] failed to load settings, using defaults', error);
      return publicDefaults;
    })
    .then((stored) => {
      if (!isCurrentInstance()) return;
      applySettings(stored);
    });

if (!SKIP_FRAME) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!isCurrentInstance()) return;
    if (areaName === 'sync' || (areaName === 'local' && changes.disabledSites)) {
      void loadSettings();
    }
  });

  // Keyboard shortcuts act on the current selection.
  chrome.runtime.onMessage.addListener((message: ContentScriptCommand) => {
    if (!isCurrentInstance() || message?.type !== CONTENT_SCRIPT_COMMAND_TYPE) return false;
    const next = readSelection();
    if (!next || !isEnabledForPage() || !isPageSafeForOrta(window.location.href)) return false;
    hideAll();
    target = next;
    bubbleLanguages = {
      correct: normalizeTargetLanguage(settings.correctionLanguage),
      translate: normalizeTargetLanguage(settings.targetLanguage),
    };
    runAction(message.action);
    return false;
  });

  void loadSettings().then(() =>
    ortaDebug('content script ready', {
      href: window.location.href,
      topFrame: window.top === window,
      enabled: isEnabledForPage(),
    }),
  );
}
