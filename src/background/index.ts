import {
  AI_GATEWAY_BASE_URL,
  CONTENT_SCRIPT_COMMAND_TYPE,
  DEFAULT_MODEL_ID,
  type ContentScriptCommand,
  type OrtaAction,
  type OrtaMessage,
} from '../shared/messages';
import { getSettings } from '../shared/settings';
import { isUrlBlocked } from '../shared/sites';
import { getCopy, type CopyDictionary } from '../shared/i18n';
import {
  getTargetLanguageNativeName,
  normalizeTargetLanguage,
} from '../shared/languages';

type GatewayMessage = {
  role: 'system' | 'user';
  content: string;
};

type GatewayCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string;
  };
};

const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (status: number, fallback: string, copy: CopyDictionary): string => {
  if (status === 401 || status === 403) {
    return copy.gatewayAuthFailed;
  }

  if (status === 429) {
    return copy.gatewayRateLimited;
  }

  if (status >= 500) {
    return copy.gatewayServerFailed;
  }

  return fallback;
};

const cleanModelOutput = (value: string): string => {
  const trimmedValue = value.trim();
  const fencedMatch = trimmedValue.match(/^```(?:text)?\s*([\s\S]*?)\s*```$/i);

  return fencedMatch?.[1]?.trim() ?? trimmedValue;
};

const buildMessages = (action: OrtaAction, text: string, targetLanguage: string, sourceLanguage?: string): GatewayMessage[] => {
  const baseInstruction =
    "You are Orta, a writing assistant that operates on the user's selected text. Return ONLY the final text, with no quotes, no markdown, and no explanations. Preserve line breaks, URLs, placeholders, mentions, numbers, code, and the original meaning. Do not change the language unless the instruction below tells you to translate.";

  if (action === 'correct') {
    let langHint = '';
    if (sourceLanguage) {
      const langName = getTargetLanguageNativeName(normalizeTargetLanguage(sourceLanguage));
      langHint = `The text is written in ${langName}. `;
    }
    return [
      {
        role: 'system',
        content: `${langHint}${baseInstruction} Fix spelling, accents, punctuation, light grammar issues and obvious typos (duplicated or missing letters). Do not change the language, tone or intent. If the text is already correct, return it exactly as received.`,
      },
      {
        role: 'user',
        content: text,
      },
    ];
  }

  const languageName = getTargetLanguageNativeName(normalizeTargetLanguage(targetLanguage));

  return [
    {
      role: 'system',
      content: `${baseInstruction} Translate the user text to ${languageName}. Keep proper nouns, variable names, technical tags and code fragments untranslated when appropriate.`,
    },
    {
      role: 'user',
      content: text,
    },
  ];
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const requestGatewayText = async ({
  apiKey,
  action,
  text,
  targetLanguage,
  sourceLanguage,
  appLanguage,
  model,
}: {
  apiKey: string;
  action: OrtaAction;
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  appLanguage: string;
  model?: string;
}): Promise<{
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}> => {
  const copy = getCopy(appLanguage);
  const effectiveModel = model || DEFAULT_MODEL_ID;
  const body = JSON.stringify({
    model: effectiveModel,
    messages: buildMessages(action, text, targetLanguage, sourceLanguage),
    temperature: action === 'correct' ? 0 : 0.1,
  });

  const attemptOnce = async (): Promise<Response> => {
    try {
      return await fetchWithTimeout(
        `${AI_GATEWAY_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        },
        FETCH_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(copy.gatewayTimeout);
      }
      throw new Error(copy.gatewayContactFailed);
    }
  };

  let response = await attemptOnce();

  if (!response.ok && (response.status === 429 || response.status >= 500)) {
    await sleep(RETRY_DELAY_MS);
    response = await attemptOnce();
  }

  const payload = (await response.json().catch(() => ({}))) as GatewayCompletion;

  if (!response.ok) {
    const fallback = payload.error?.message ?? copy.transformFailed;
    throw new Error(getErrorMessage(response.status, fallback, copy));
  }

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(copy.noModelOutput);
  }

  return {
    text: cleanModelOutput(content),
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
    },
  };
};

const validateGatewayKey = async (apiKey: string, modelId?: string): Promise<boolean> => {
  const model = modelId || DEFAULT_MODEL_ID;
  const response = await fetchWithTimeout(
    `${AI_GATEWAY_BASE_URL}/models/${encodeURIComponent(model)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
    FETCH_TIMEOUT_MS,
  );

  return response.ok;
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message: OrtaMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message.type === 'orta:validateGatewayKey') {
    void (async () => {
      const settings = await getSettings();
      const copy = getCopy(settings.appLanguage);
      const apiKey = message.apiKey?.trim() || settings.apiKey.trim();
      const modelToValidate = message.model || settings.model || DEFAULT_MODEL_ID;

      if (!apiKey) {
        sendResponse({ ok: false, error: copy.keyRequired });
        return;
      }

      try {
        const isValid = await validateGatewayKey(apiKey, modelToValidate);
        sendResponse(
          isValid
            ? { ok: true, model: modelToValidate }
            : { ok: false, error: copy.gatewayInvalid },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          sendResponse({ ok: false, error: copy.gatewayTimeout });
          return;
        }
        sendResponse({ ok: false, error: copy.gatewayContactFailed });
      }
    })();

    return true;
  }

  if (message.type === 'orta:transform') {
    void (async () => {
      const settings = await getSettings();
      const copy = getCopy(settings.appLanguage);
      const apiKey = settings.apiKey.trim();
      const pageUrl = sender.tab?.url ?? '';

      if (!settings.enabled) {
        sendResponse({ ok: false, error: copy.ortaDisabled });
        return;
      }

      if (pageUrl && isUrlBlocked(pageUrl, settings.disabledSites)) {
        sendResponse({ ok: false, error: copy.siteDisabled });
        return;
      }

      if (message.action === 'correct' && !settings.correctionEnabled) {
        sendResponse({ ok: false, error: copy.correctionDisabled });
        return;
      }

      if (message.action === 'translate' && !settings.translationEnabled) {
        sendResponse({ ok: false, error: copy.translationDisabled });
        return;
      }

      if (!apiKey) {
        sendResponse({ ok: false, error: copy.apiKeyMissing });
        return;
      }

      if (!message.text.trim()) {
        sendResponse({ ok: false, error: copy.noText });
        return;
      }

      try {
        const result = await requestGatewayText({
          apiKey,
          action: message.action,
          text: message.text,
          targetLanguage: message.targetLanguage || settings.targetLanguage,
          sourceLanguage: message.sourceLanguage || settings.correctionLanguage,
          appLanguage: settings.appLanguage,
          model: settings.model,
        });

        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : copy.transformFailed,
        });
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
