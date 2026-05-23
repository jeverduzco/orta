import { BUILTIN_BLOCKED_DOMAINS } from './blockedDomains';
import type { PublicOrtaSettings } from './settings';

export const normalizeSitePattern = (value: string): string => {
  const rawValue = value.trim().toLowerCase();

  if (!rawValue) {
    return '';
  }

  const hasOverridePrefix = rawValue.startsWith('!');
  const stripped = hasOverridePrefix ? rawValue.slice(1) : rawValue;
  const withoutProtocol = stripped.replace(/^[a-z]+:\/\//, '');
  const withoutPath = withoutProtocol.split('/')[0] ?? withoutProtocol;
  const withoutPort = withoutPath.replace(/:\d+$/, '');
  const normalized = withoutPort.replace(/\.$/, '');

  return hasOverridePrefix && normalized ? `!${normalized}` : normalized;
};

const stripOverridePrefix = (value: string): string => (value.startsWith('!') ? value.slice(1) : value);

const matchesPattern = (hostname: string, pattern: string): boolean => {
  if (pattern === '*') {
    return true;
  }

  if (pattern.startsWith('*.')) {
    const rootDomain = pattern.slice(2);
    return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
  }

  return hostname === pattern || hostname.endsWith(`.${pattern}`);
};

export const getHostnameFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const isHostnameBlocked = (hostname: string, patterns: readonly string[]): boolean => {
  const normalizedHostname = stripOverridePrefix(normalizeSitePattern(hostname));

  if (!normalizedHostname) {
    return false;
  }

  return patterns.some((pattern) => {
    const normalized = normalizeSitePattern(pattern);

    if (!normalized || normalized.startsWith('!')) {
      return false;
    }

    return matchesPattern(normalizedHostname, normalized);
  });
};

const isHostnameAllowedByOverride = (hostname: string, patterns: readonly string[]): boolean => {
  const normalizedHostname = stripOverridePrefix(normalizeSitePattern(hostname));

  if (!normalizedHostname) {
    return false;
  }

  return patterns.some((pattern) => {
    const normalized = normalizeSitePattern(pattern);

    if (!normalized.startsWith('!')) {
      return false;
    }

    return matchesPattern(normalizedHostname, normalized.slice(1));
  });
};

export const isUrlBlocked = (url: string, patterns: readonly string[]): boolean =>
  isHostnameBlocked(getHostnameFromUrl(url), patterns);

export const isHostnameBlockedByBuiltin = (hostname: string): boolean =>
  isHostnameBlocked(hostname, BUILTIN_BLOCKED_DOMAINS);

export const isOrtaAvailableForUrl = (url: string, settings: PublicOrtaSettings): boolean => {
  if (!settings.enabled) {
    return false;
  }

  if (!settings.correctionEnabled && !settings.translationEnabled) {
    return false;
  }

  const hostname = getHostnameFromUrl(url);

  if (!hostname) {
    return true;
  }

  const userOverrides = settings.disabledSites;

  if (isHostnameAllowedByOverride(hostname, userOverrides)) {
    return !isHostnameBlocked(hostname, userOverrides);
  }

  if (isHostnameBlocked(hostname, BUILTIN_BLOCKED_DOMAINS)) {
    return false;
  }

  return !isHostnameBlocked(hostname, userOverrides);
};
