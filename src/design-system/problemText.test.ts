import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const PROBLEM_TONES = new Set(['text-red-400', 'text-amber-400']);
const WARM_CLASS = /(?<![\w:!-])!?text-(?:red|rose|orange|amber|yellow)-\d{2,3}(?:\/[\w.[\]]+)?/g;
const WARM_HEX = /text-\[#(?:fecaca|fca5a5|f87171|ef4444|fde68a|fcd34d|fbbf24|f59e0b)\]/gi;

function offTone(source: string) {
  const classes = [...source.matchAll(WARM_CLASS)].map(([match]) => match.replace(/^!/, ''));
  const hexes = [...source.matchAll(WARM_HEX)].map(([match]) => match);

  return [...classes.filter((c) => !PROBLEM_TONES.has(c)), ...hexes];
}

describe('problem text', () => {
  it('reads the samples right', () => {
    expect(offTone('text-red-400 text-amber-400 hover:text-red-300 hover:!text-red-200')).toEqual([]);
    expect(offTone('text-red-400/80 text-amber-200/70 !text-red-300 text-[#f87171]')).toEqual([
      'text-red-400/80',
      'text-amber-200/70',
      'text-red-300',
      'text-[#f87171]',
    ]);
  });

  it('writes every error in one red and every warning in one amber', () => {
    const found = Object.entries(SOURCES).flatMap(([path, source]) => offTone(source).map((c) => `${path} ${c}`));

    expect(found).toEqual([]);
  });
});
