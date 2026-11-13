import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('Spinner', () => {
  it('is the only thing in the app that spins', () => {
    expect(Object.keys(SOURCES)).toContain('./Spinner.tsx');

    const spinning = Object.entries(SOURCES)
      .filter(([path, source]) => path !== './Spinner.tsx' && source.includes('animate-spin'))
      .map(([path]) => path);

    expect(spinning).toEqual([]);
  });
});
