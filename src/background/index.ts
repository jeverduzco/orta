import {
  CONTENT_SCRIPT_COMMAND_TYPE,
  MAX_SELECTION_CHARS,
  TRANSFORM_PORT_NAME,
  type ContentScriptCommand,
  type OrtaAction,
  type OrtaMessage,
  type TransformErrorCode,
  type TransformPortMessage,
  type TransformStart,
  type ValidateGatewayResponse,
} from '../shared/messages';
import { getSettings, normalizeModelId, type OrtaSettings } from '../shared/settings';
import { isOrtaAvailableForUrl } from '../shared/sites';
import { isAuthLikePath } from '../shared/pageGuard';
import { getCopy, type CopyDictionary } from '../shared/i18n';
import { buildMessages, GatewayError, streamCompletion, validateGatewayKey } from './gateway';
import { errorMessageFor } from './errors';

/** Minimum gap between streamed updates sent to the page (keeps IPC cheap). */
const DELTA_THROTTLE_MS = 50;

/** Mirrors the content script's checks so a page can never bypass them. */
const getBlockReason = (
  settings: OrtaSettings,
  action: OrtaAction,
  urls: string[],
  copy: CopyDictionary,
): string | null => {
  if (!settings.enabled) return copy.ortaDisabled;
  if (action === 'correct' && !settings.correctionEnabled) return copy.correctionDisabled;
  if (action === 'translate' && !settings.translationEnabled) return copy.translationDisabled;

  for (const url of urls) {
    if (!url) continue;
    if (!isOrtaAvailableForUrl(url, settings) || isAuthLikePath(url)) return copy.siteDisabled;
  }

  return null;
};

const handleTransformPort = (port: chrome.runtime.Port): void => {
  const controller = new AbortController();
  let disconnected = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
    controller.abort();
  });

  const post = (message: TransformPortMessage): void => {
    if (disconnected) return;
    try {
      port.postMessage(message);
    } catch {
      disconnected = true;
    }
  };

  port.onMessage.addListener(async (message: TransformStart) => {
    if (message?.type !== 'start') return;

    const settings = await getSettings();
    const copy = getCopy(settings.appLanguage);
    const fail = (code: TransformErrorCode, detail?: string) =>
      post({ type: 'error', code, error: errorMessageFor(code, copy, detail) });

    const urls = [port.sender?.tab?.url ?? '', port.sender?.url ?? ''];
    const blockReason = getBlockReason(settings, message.action, urls, copy);
    if (blockReason) return fail('disabled', blockReason);

    const text = typeof message.text === 'string' ? message.text : '';
    if (!text.trim()) return fail('empty');
    if (text.length > MAX_SELECTION_CHARS) return fail('tooLong');

    const apiKey = settings.apiKey.trim();
    if (!apiKey) return fail('apiKeyMissing');

    let lastSent = 0;
    let pending: string | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushTimer = undefined;
      if (pending === null) return;
      post({ type: 'delta', text: pending });
      pending = null;
      lastSent = Date.now();
    };

    try {
      const result = await streamCompletion({
        apiKey,
        model: normalizeModelId(settings.model),
        messages: buildMessages(
          message.action,
          text,
          message.targetLanguage || settings.targetLanguage,
          message.sourceLanguage || settings.correctionLanguage,
        ),
        temperature: message.action === 'correct' ? 0 : 0.1,
        signal: controller.signal,
        onText: (partial) => {
          pending = partial;
          const wait = DELTA_THROTTLE_MS - (Date.now() - lastSent);
          if (wait <= 0) flush();
          else flushTimer ??= setTimeout(flush, wait);
        },
      });
      clearTimeout(flushTimer);
      post({ type: 'done', text: result.text, usage: result.usage });
    } catch (error) {
      clearTimeout(flushTimer);
      if (controller.signal.aborted && disconnected) return; // user cancelled
      const gatewayError = error instanceof GatewayError ? error : new GatewayError('unknown');
      // Only surface the gateway's own wording for errors we have no copy for.
      fail(gatewayError.code, gatewayError.code === 'unknown' ? undefined : gatewayError.message);
    }
  });
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TRANSFORM_PORT_NAME || port.sender?.id !== chrome.runtime.id) {
    port.disconnect();
    return;
  }
  handleTransformPort(port);
});

chrome.runtime.onMessage.addListener((message: OrtaMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message.type === 'orta:openOptions') {
    void chrome.runtime.openOptionsPage();
    return false;
  }

  if (message.type === 'orta:validateGatewayKey') {
    // Only extension pages (the options page) may validate keys; never content
    // scripts. The options page runs in a tab, so check the sender's origin
    // rather than `sender.tab`.
    if (!sender.url?.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }

    void (async () => {
      const settings = await getSettings();
      const copy = getCopy(settings.appLanguage);
      const apiKey = message.apiKey?.trim() || settings.apiKey.trim();
      const model = normalizeModelId(message.model || settings.model);
      const respond = (response: ValidateGatewayResponse) => sendResponse(response);

      if (!apiKey) {
        respond({ ok: false, error: copy.keyRequired });
        return;
      }

      try {
        const result = await validateGatewayKey(apiKey, model);
        if (result === 'ok') respond({ ok: true, model });
        else if (result === 'invalidKey') respond({ ok: false, error: copy.gatewayAuthFailed });
        else respond({ ok: false, error: copy.gatewayModelUnavailable });
      } catch (error) {
        const code = error instanceof GatewayError ? error.code : 'network';
        respond({ ok: false, error: errorMessageFor(code, copy) });
      }
    })();

    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  const action: OrtaAction | null =
    command === 'orta-correct' ? 'correct' : command === 'orta-translate' ? 'translate' : null;

  if (!action) {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return;
  }

  const payload: ContentScriptCommand = { type: CONTENT_SCRIPT_COMMAND_TYPE, action };

  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    // Tab without content script (chrome://, store, etc.) — silently ignore.
  }
});
