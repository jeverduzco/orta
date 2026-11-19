import { MAX_SELECTION_CHARS, type TransformErrorCode } from '../shared/messages';
import type { CopyDictionary } from '../shared/i18n';

export const errorMessageFor = (code: TransformErrorCode, copy: CopyDictionary, detail?: string): string => {
  switch (code) {
    case 'apiKeyMissing':
      return copy.apiKeyMissing;
    case 'auth':
      return copy.gatewayAuthFailed;
    case 'empty':
      return copy.noText;
    case 'modelUnavailable':
      return copy.gatewayModelUnavailable;
    case 'network':
      return copy.gatewayContactFailed;
    case 'noOutput':
      return copy.noModelOutput;
    case 'rateLimited':
      return copy.gatewayRateLimited;
    case 'server':
      return copy.gatewayServerFailed;
    case 'timeout':
      return copy.gatewayTimeout;
    case 'tooLong':
      return copy.textTooLong.replace('{max}', MAX_SELECTION_CHARS.toLocaleString());
    case 'disabled':
      return detail ?? copy.ortaDisabled;
    default:
      return detail || copy.transformFailed;
  }
};
