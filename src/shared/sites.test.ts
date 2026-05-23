import { describe, expect, it } from 'vitest';
import {
  isHostnameBlocked,
  isHostnameBlockedByBuiltin,
  isOrtaAvailableForUrl,
  isUrlBlocked,
  normalizeSitePattern,
} from './sites';
import { publicDefaults } from './settings';

describe('site exclusions', () => {
  it('normalizes full urls into host patterns', () => {
    expect(normalizeSitePattern('https://App.Example.com:443/path')).toBe('app.example.com');
  });

  it('blocks exact domains and subdomains', () => {
    expect(isHostnameBlocked('docs.example.com', ['example.com'])).toBe(true);
    expect(isHostnameBlocked('example.org', ['example.com'])).toBe(false);
  });

  it('supports wildcard subdomain patterns', () => {
    expect(isHostnameBlocked('mail.company.com', ['*.company.com'])).toBe(true);
    expect(isHostnameBlocked('company.com', ['*.company.com'])).toBe(true);
  });

  it('checks urls safely', () => {
    expect(isUrlBlocked('https://notion.so/page', ['notion.so'])).toBe(true);
    expect(isUrlBlocked('chrome://extensions', ['chrome.com'])).toBe(false);
  });

  it('preserves the override prefix when normalizing', () => {
    expect(normalizeSitePattern('!Chase.com')).toBe('!chase.com');
    expect(normalizeSitePattern('!')).toBe('');
  });

  it('blocks built-in sensitive domains by default', () => {
    expect(isHostnameBlockedByBuiltin('chase.com')).toBe(true);
    expect(isHostnameBlockedByBuiltin('login.microsoftonline.com')).toBe(true);
    expect(isHostnameBlockedByBuiltin('whitehouse.gov')).toBe(true);
    expect(isHostnameBlockedByBuiltin('example.com')).toBe(false);
  });

  it('allows users to override a built-in blocked domain via "!" prefix', () => {
    expect(
      isOrtaAvailableForUrl('https://chase.com/account', {
        ...publicDefaults,
        disabledSites: ['!chase.com'],
      }),
    ).toBe(true);
  });

  it('respects user blocklist for non-built-in domains', () => {
    expect(
      isOrtaAvailableForUrl('https://notion.so/page', {
        ...publicDefaults,
        disabledSites: ['notion.so'],
      }),
    ).toBe(false);
  });

  it('blocks built-in domains even when settings are otherwise default', () => {
    expect(isOrtaAvailableForUrl('https://login.microsoftonline.com/auth', publicDefaults)).toBe(false);
  });

  it('returns false when global toggle is off, regardless of overrides', () => {
    expect(
      isOrtaAvailableForUrl('https://chase.com', {
        ...publicDefaults,
        enabled: false,
        disabledSites: ['!chase.com'],
      }),
    ).toBe(false);
  });
});
