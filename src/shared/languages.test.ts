import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGET_LANGUAGE,
  getTargetLanguageLabel,
  getTargetLanguageNativeName,
  normalizeTargetLanguage,
} from './languages';

describe('language registry', () => {
  it('normalizes valid codes', () => {
    expect(normalizeTargetLanguage('en')).toBe('en');
    expect(normalizeTargetLanguage('zh-Hans')).toBe('zh-Hans');
  });

  it('migrates legacy spanish labels', () => {
    expect(normalizeTargetLanguage('Inglés')).toBe('en');
    expect(normalizeTargetLanguage('Ingles')).toBe('en');
    expect(normalizeTargetLanguage('Árabe')).toBe('ar');
    expect(normalizeTargetLanguage('Arabe')).toBe('ar');
    expect(normalizeTargetLanguage('Chino simplificado')).toBe('zh-Hans');
  });

  it('falls back to default when unknown', () => {
    expect(normalizeTargetLanguage('')).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(normalizeTargetLanguage('Klingon')).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it('exposes localized labels', () => {
    expect(getTargetLanguageLabel('en', 'es')).toBe('Inglés');
    expect(getTargetLanguageLabel('en', 'en')).toBe('English');
    expect(getTargetLanguageLabel('en', 'pt')).toBe('Inglês');
  });

  it('exposes native names for the prompt', () => {
    expect(getTargetLanguageNativeName('en')).toBe('English');
    expect(getTargetLanguageNativeName('ja')).toBe('日本語');
    expect(getTargetLanguageNativeName('zh-Hans')).toBe('简体中文');
  });
});
