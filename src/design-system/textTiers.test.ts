import { describe, expect, it } from 'vitest';

const CLASS_SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const STYLE_SOURCES = import.meta.glob<string>(['../**/*.css'], { eager: true, query: '?raw', import: 'default' });

const TIERS = new Set([50, 60, 90]);
const WHITE_TEXT = /(?<![\w-])text-white\/(\d{2})(?!\d)/g;
const WHITE_COLOR = /(?<![\w-])color:\s*rgba\(\s*255,\s*255,\s*255,\s*(0?\.\d+)\s*\)/g;

const offTier = (alpha: number) => alpha > 50 && alpha < 100 && !TIERS.has(alpha);

function offTierClasses(source: string) {
  return [...source.matchAll(WHITE_TEXT)].filter(([, alpha]) => offTier(Number(alpha))).map(([match]) => match);
}

function offTierStyles(source: string) {
  return [...source.matchAll(WHITE_COLOR)]
    .filter(([, alpha]) => offTier(Math.round(Number(alpha) * 100)))
    .map(([match]) => match);
}

describe('text tiers', () => {
  it('reads the samples right', () => {
    expect(
      offTierClasses('text-white/90 text-white/60 text-white/50 text-white/30 hover:text-white bg-white/80'),
    ).toEqual([]);
    expect(offTierClasses('text-white/85 hover:text-white/75 group-hover:text-white/55')).toEqual([
      'text-white/85',
      'text-white/75',
      'text-white/55',
    ]);
    expect(offTierStyles('color: rgba(255, 255, 255, 0.9); background-color: rgba(255, 255, 255, 0.08);')).toEqual([]);
    expect(offTierStyles('color: rgba(255, 255, 255, 0.92);')).toEqual(['color: rgba(255, 255, 255, 0.92)']);
  });

  it('writes every text in white/90, white/60 or white/50', () => {
    const classes = Object.entries(CLASS_SOURCES).flatMap(([path, source]) =>
      offTierClasses(source).map((c) => `${path} ${c}`),
    );
    const styles = Object.entries(STYLE_SOURCES).flatMap(([path, source]) =>
      offTierStyles(source).map((c) => `${path} ${c}`),
    );

    expect([...classes, ...styles]).toEqual([]);
  });
});
