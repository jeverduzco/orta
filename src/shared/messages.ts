export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export const DEFAULT_MODEL_ID = 'google/gemini-3.5-flash';

export const MODEL_OPTIONS = [
  { id: 'google/gemini-3.5-flash', label: 'Flash (Gemini 3.5)' },
  { id: 'minimax/minimax-m2.7', label: 'Minimax M2.7' },
  { id: 'xai/grok-4.3', label: 'Grok 4.3 (xAI)' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
export type ModelId = ModelOption['id'];

/** @deprecated Use DEFAULT_MODEL_ID and dynamic settings.model instead */
export const ORTA_MODEL_ID = DEFAULT_MODEL_ID;
export const CONTENT_SCRIPT_COMMAND_TYPE = 'orta:command' as const;

export type OrtaAction = 'correct' | 'translate';

export type TransformRequest = {
  type: 'orta:transform';
  action: OrtaAction;
  text: string;
  targetLanguage?: string;
};

export type TransformResponse =
  | {
      ok: true;
      text: string;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

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

export type ContentScriptCommand = {
  type: typeof CONTENT_SCRIPT_COMMAND_TYPE;
  action: OrtaAction;
};

export type OrtaMessage = TransformRequest | ValidateGatewayRequest;
