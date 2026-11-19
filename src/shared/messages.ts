export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export const DEFAULT_MODEL_ID = 'meta/muse-ember';

export const MODEL_OPTIONS = [
  { id: 'meta/muse-ember', label: 'Muse Ember (Meta)' },
  { id: 'google/gemini-3.5-flash', label: 'Flash (Gemini 3.5)' },
  { id: 'minimax/minimax-m3', label: 'Minimax M3' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
export type ModelId = ModelOption['id'];

/** Longest selection Orta will send to the model, in characters. */
export const MAX_SELECTION_CHARS = 8000;

export const CONTENT_SCRIPT_COMMAND_TYPE = 'orta:command' as const;

/** Name of the long-lived port the content script opens for one streamed transform. */
export const TRANSFORM_PORT_NAME = 'orta:transform';

export type OrtaAction = 'correct' | 'translate';

export type TransformErrorCode =
  | 'apiKeyMissing'
  | 'auth'
  | 'disabled'
  | 'empty'
  | 'modelUnavailable'
  | 'network'
  | 'noOutput'
  | 'rateLimited'
  | 'server'
  | 'timeout'
  | 'tooLong'
  | 'unknown';

/** Content script → background, first message on a transform port. */
export type TransformStart = {
  type: 'start';
  action: OrtaAction;
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
};

export type TransformUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

/** Background → content script, on the transform port. */
export type TransformPortMessage =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; usage?: TransformUsage }
  | { type: 'error'; error: string; code: TransformErrorCode };

export type ValidateGatewayRequest = {
  type: 'orta:validateGatewayKey';
  apiKey?: string;
  model?: string;
};

export type ValidateGatewayResponse =
  | {
      ok: true;
      model: string;
    }
  | {
      ok: false;
      error: string;
    };

export type OpenOptionsRequest = {
  type: 'orta:openOptions';
};

export type ContentScriptCommand = {
  type: typeof CONTENT_SCRIPT_COMMAND_TYPE;
  action: OrtaAction;
};

export type OrtaMessage = ValidateGatewayRequest | OpenOptionsRequest;
