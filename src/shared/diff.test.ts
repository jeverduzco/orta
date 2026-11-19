import { describe, expect, it } from 'vitest';
import { diffWords, hasChanges, tokenize } from './diff';

const render = (before: string, after: string): string =>
  (diffWords(before, after) ?? [])
    .map((segment) =>
      segment.type === 'equal' ? segment.text : segment.type === 'insert' ? `[+${segment.text}]` : `[-${segment.text}]`,
    )
    .join('');

describe('diffWords', () => {
  it('marks a corrected word as delete + insert', () => {
    expect(render('Esta es una prueva.', 'Esta es una prueba.')).toBe('Esta es una [-prueva][+prueba].');
  });

  it('handles accents and punctuation as separate tokens', () => {
    expect(render('esta bien', 'está bien.')).toBe('[-esta][+está] bien[+.]');
  });

  it('returns only equal segments for identical text', () => {
    const segments = diffWords('Hola mundo', 'Hola mundo');
    expect(segments).toEqual([{ type: 'equal', text: 'Hola mundo' }]);
    expect(hasChanges(segments)).toBe(false);
  });

  it('reconstructs both sides exactly', () => {
    const before = 'Line one\nline  two, with typos teh end';
    const after = 'Line one\nLine two, with typos: the end';
    const segments = diffWords(before, after) ?? [];
    expect(segments.filter((s) => s.type !== 'insert').map((s) => s.text).join('')).toBe(before);
    expect(segments.filter((s) => s.type !== 'delete').map((s) => s.text).join('')).toBe(after);
  });

  it('keeps non-latin words whole', () => {
    expect(tokenize('日本語 テスト')).toEqual(['日本語', ' ', 'テスト']);
  });

  it('gives up on huge inputs instead of freezing the page', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
    expect(diffWords(before, after)).toBeNull();
  });
});
