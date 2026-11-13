import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '../**/*.css', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const TAILWIND_COLOR = /\[#([0-9a-f]{6})\]/gi;
const CSS_COLOR = /#([0-9a-f]{6})\b/gi;
const TINT_SPREAD = 12;

function isTintedGrey(hex: string) {
  const channels = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const spread = Math.max(...channels) - Math.min(...channels);

  return spread > 0 && spread <= TINT_SPREAD;
}

function tintedGreys(path: string, source: string) {
  const pattern = path.endsWith('.css') ? CSS_COLOR : TAILWIND_COLOR;

  return [...source.matchAll(pattern)].filter(([, hex]) => isTintedGrey(hex)).map(([match]) => `${path} ${match}`);
}

describe('surface colours', () => {
  it('reads the samples right', () => {
    expect(isTintedGrey('2a2a2f')).toBe(true);
    expect(isTintedGrey('3f3f46')).toBe(true);
    expect(isTintedGrey('222222')).toBe(false);
    expect(isTintedGrey('0d99ff')).toBe(false);
  });

  it('uses only neutral greys in classes and stylesheets', () => {
    expect(Object.keys(SOURCES)).toContain('../index.css');

    const found = Object.entries(SOURCES).flatMap(([path, source]) => tintedGreys(path, source));

    expect(found).toEqual([]);
  });
});
