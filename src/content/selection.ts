/**
 * Reading the user's selection, measuring where it is on screen (live, so the
 * UI can follow scrolling), and writing a result back into editable fields.
 */

export const MIN_SELECTION_LENGTH = 2;

type TextField = HTMLInputElement | HTMLTextAreaElement;

export type InputTarget = {
  kind: 'input';
  element: TextField;
  start: number;
  end: number;
  /** Exact selected substring, including surrounding whitespace. */
  raw: string;
  /** Trimmed text sent to the model. */
  text: string;
};

export type RangeTarget = {
  kind: 'range';
  range: Range;
  raw: string;
  text: string;
};

export type SelectionTarget = InputTarget | RangeTarget;

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email']);

export const isTextField = (element: Element | null): element is TextField => {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type.toLowerCase());
};

/** Follows focus into open shadow roots (web-component editors). */
const getDeepActiveElement = (): Element | null => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
};

const readFieldSelection = (element: TextField): InputTarget | null => {
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = element.selectionStart;
    end = element.selectionEnd;
  } catch {
    return null; // selection APIs throw on some input types
  }
  if (start === null || end === null || end <= start) return null;
  const raw = element.value.slice(start, end);
  const text = raw.trim();
  if (text.length < MIN_SELECTION_LENGTH) return null;
  return { kind: 'input', element, start, end, raw, text };
};

const readDocumentSelection = (): RangeTarget | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const raw = selection.toString();
  const text = raw.trim();
  if (text.length < MIN_SELECTION_LENGTH) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { kind: 'range', range, raw, text };
};

export const readSelection = (): SelectionTarget | null => {
  const active = getDeepActiveElement();
  if (isTextField(active)) {
    const fieldTarget = readFieldSelection(active);
    if (fieldTarget) return fieldTarget;
  }
  return readDocumentSelection();
};

/** Cheap fingerprint used to detect selection changes without building rects. */
export const getSelectionFingerprint = (): string => {
  const active = getDeepActiveElement();
  if (isTextField(active)) {
    try {
      return `f:${active.selectionStart}:${active.selectionEnd}`;
    } catch {
      return '';
    }
  }
  return `d:${window.getSelection()?.toString() ?? ''}`;
};

export const isSameTarget = (a: SelectionTarget | null, b: SelectionTarget | null): boolean => {
  if (!a || !b || a.kind !== b.kind || a.raw !== b.raw) return false;
  if (a.kind === 'input' && b.kind === 'input') {
    return a.element === b.element && a.start === b.start && a.end === b.end;
  }
  if (a.kind === 'range' && b.kind === 'range') {
    return (
      a.range.startContainer === b.range.startContainer &&
      a.range.startOffset === b.range.startOffset &&
      a.range.endContainer === b.range.endContainer &&
      a.range.endOffset === b.range.endOffset
    );
  }
  return false;
};

// ===== Geometry =====

export type TargetRects = {
  /** First line of the selection — where the bubble handle docks. */
  first: DOMRect;
  /** Whole selection — where the result card docks. */
  bounds: DOMRect;
};

const MIRROR_PROPERTIES = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'fontFeatureSettings',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'direction',
  'wordBreak',
  'overflowWrap',
] as const;

const clampRectTo = (rect: DOMRect, container: DOMRect): DOMRect => {
  const top = Math.min(Math.max(rect.top, container.top), Math.max(container.top, container.bottom - rect.height));
  const left = Math.min(Math.max(rect.left, container.left), Math.max(container.left, container.right - 1));
  return new DOMRect(left, top, Math.min(rect.width, container.width), rect.height);
};

/**
 * Native fields don't expose per-character rects, so lay the text out in an
 * invisible mirror with identical metrics and measure the selected span there.
 */
const measureFieldSelection = (target: InputTarget): TargetRects => {
  const { element, start, end } = target;
  const fieldRect = element.getBoundingClientRect();
  const fallback = { first: fieldRect, bounds: fieldRect };

  try {
    const style = window.getComputedStyle(element);
    const mirror = document.createElement('div');
    const isTextarea = element instanceof HTMLTextAreaElement;

    for (const property of MIRROR_PROPERTIES) {
      mirror.style[property] = style[property];
    }
    Object.assign(mirror.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      visibility: 'hidden',
      pointerEvents: 'none',
      overflow: 'hidden',
      whiteSpace: isTextarea ? 'pre-wrap' : 'pre',
      contain: 'strict',
    });
    if (!isTextarea) {
      mirror.style.lineHeight = style.height; // single-line inputs center text vertically
    }

    const value = element.value;
    mirror.textContent = value.slice(0, start);
    const marker = document.createElement('span');
    marker.textContent = value.slice(start, end) || '​';
    mirror.append(marker, document.createTextNode(value.slice(end)));

    document.documentElement.append(mirror);
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRects = Array.from(marker.getClientRects());
    const markerBounds = marker.getBoundingClientRect();
    mirror.remove();

    const dx = fieldRect.left - mirrorRect.left - element.scrollLeft;
    const dy = fieldRect.top - mirrorRect.top - element.scrollTop;
    const shift = (rect: DOMRect) => new DOMRect(rect.left + dx, rect.top + dy, rect.width, rect.height);
    const firstRaw = markerRects.find((rect) => rect.width > 0 || rect.height > 0) ?? markerBounds;

    return {
      first: clampRectTo(shift(firstRaw), fieldRect),
      bounds: clampRectTo(shift(markerBounds), fieldRect),
    };
  } catch {
    return fallback;
  }
};

const measureRange = (range: Range): TargetRects | null => {
  const bounds = range.getBoundingClientRect();
  if (bounds.width === 0 && bounds.height === 0) return null;
  const first = Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0) ?? bounds;
  return { first, bounds };
};

/** Live on-screen geometry for a target, or null if it is no longer rendered. */
export const measureTarget = (target: SelectionTarget): TargetRects | null => {
  if (target.kind === 'input') {
    return target.element.isConnected ? measureFieldSelection(target) : null;
  }
  return target.range.startContainer.isConnected ? measureRange(target.range) : null;
};

// ===== Replacing =====

const getEditableRoot = (range: Range): HTMLElement | null => {
  const node = range.commonAncestorContainer;
  let element = node instanceof HTMLElement ? node : node.parentElement;
  if (!element?.isContentEditable) return null;
  while (element.parentElement?.isContentEditable) {
    element = element.parentElement;
  }
  return element;
};

export const canReplace = (target: SelectionTarget): boolean => {
  if (target.kind === 'input') {
    const { element } = target;
    return element.isConnected && !element.disabled && !element.readOnly;
  }
  return target.range.startContainer.isConnected && getEditableRoot(target.range) !== null;
};

/** Keeps the whitespace the user selected around the trimmed text. */
const padLikeOriginal = (raw: string, text: string): string => {
  const leading = raw.match(/^\s*/)?.[0] ?? '';
  const trailing = raw.match(/\s*$/)?.[0] ?? '';
  return `${leading}${text}${trailing}`;
};

/** Whitespace-insensitive compare: Range#toString drops the line breaks between blocks. */
const sameText = (a: string, b: string): boolean => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const isSameRange = (a: Range, b: Range): boolean =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;

/**
 * Rich editors (Draft.js on X, Lexical, ProseMirror, Slate, Quill, Gmail) keep
 * their own document model. Text written straight into their DOM desyncs it:
 * the editor stops responding to the next keystroke. A paste event is the
 * one input every one of them handles through its own model, so offer the
 * text as a paste first. Returns true when the editor took it.
 */
const pasteIntoEditor = (target: Node, text: string): boolean => {
  try {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const element = target instanceof Element ? target : target.parentElement;
    if (!element) return false;
    element.dispatchEvent(event);
    return event.defaultPrevented;
  } catch {
    return false;
  }
};

/**
 * Writes `text` over the original selection so the page's editor sees a normal
 * edit and the change can be undone with Cmd/Ctrl+Z. Fields use `insertText`;
 * contenteditable editors get a paste they apply through their own model, and
 * plain contenteditable falls back to `insertText`.
 * Resolves false when the original text is gone (the page changed meanwhile).
 */
export const replaceTarget = async (target: SelectionTarget, text: string): Promise<boolean> => {
  if (!canReplace(target)) return false;
  const replacement = padLikeOriginal(target.raw, text);

  if (target.kind === 'input') {
    const { element, raw } = target;
    let { start } = target;
    if (element.value.slice(start, start + raw.length) !== raw) {
      start = element.value.indexOf(raw);
      if (start === -1) return false;
    }
    const end = start + raw.length;

    element.focus({ preventScroll: true });
    element.setSelectionRange(start, end);
    const inserted = document.execCommand('insertText', false, replacement);
    if (!inserted || element.value.slice(start, start + replacement.length) !== replacement) {
      element.setRangeText(replacement, start, end, 'end');
      element.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: replacement }),
      );
    }
    return true;
  }

  const root = getEditableRoot(target.range);
  if (!root || !sameText(target.range.toString(), target.raw)) return false;

  root.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return false;
  const current = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (!current || !isSameRange(current, target.range)) {
    selection.removeAllRanges();
    selection.addRange(target.range);
    // Let the editor see the selectionchange and sync its own selection model.
    await nextFrame();
  }

  if (pasteIntoEditor(target.range.startContainer, replacement)) return true;
  return document.execCommand('insertText', false, replacement);
};
