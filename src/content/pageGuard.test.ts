import { describe, expect, it } from 'vitest';
import { isAuthLikePath } from './pageGuard';

describe('pageGuard', () => {
  it('flags common auth and payment paths', () => {
    expect(isAuthLikePath('https://example.com/login')).toBe(true);
    expect(isAuthLikePath('https://example.com/sign-in')).toBe(true);
    expect(isAuthLikePath('https://example.com/account/reset-password')).toBe(true);
    expect(isAuthLikePath('https://example.com/checkout/step-2')).toBe(true);
    expect(isAuthLikePath('https://example.com/billing/invoice/123')).toBe(true);
    expect(isAuthLikePath('https://example.com/auth/2fa')).toBe(true);
  });

  it('does not flag generic content paths', () => {
    expect(isAuthLikePath('https://example.com/about')).toBe(false);
    expect(isAuthLikePath('https://example.com/posts/login-tips')).toBe(false);
    expect(isAuthLikePath('https://example.com/')).toBe(false);
  });

  it('returns false for invalid urls', () => {
    expect(isAuthLikePath('not a url')).toBe(false);
  });
});
