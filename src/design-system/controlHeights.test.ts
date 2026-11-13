import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '../**/*.ts', '!../**/*.test.ts', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const REM_HEIGHT_UNDER_CONTROL = /(?<![\w-])(?:(?:min|max)-)?(?:h|size)-(?:7|7\.5|8|9)(?![\w.[-])/g;

const remHeights = (path: string, source: string) =>
  [...source.matchAll(REM_HEIGHT_UNDER_CONTROL)].map(([match]) => `${path} ${match}`);

describe('control heights', () => {
  it('reads the samples right', () => {
    expect(remHeights('a', 'w-full h-8 px-2')).toEqual(['a h-8']);
    expect(remHeights('a', 'min-h-9 h-7! hover:h-7.5')).toEqual(['a min-h-9', 'a h-7', 'a h-7.5']);
    expect(remHeights('a', 'h-[32px] w-8 h-80 max-h-[45%] group-hover/h-8x')).toEqual([]);
  });

  it('writes heights near the 32px control minimum in px, never rem steps', () => {
    expect(Object.keys(SOURCES)).toContain('../App.tsx');

    const found = Object.entries(SOURCES).flatMap(([path, source]) => remHeights(path, source));

    expect(found).toEqual([]);
  });
});
