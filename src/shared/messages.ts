export const ORTA_MODEL_ID = 'google/gemini-3.5-flash';
export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
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
