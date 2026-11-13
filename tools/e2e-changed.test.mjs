import { describe, expect, it } from 'vitest';
import { changedLines, pattern, testsAt } from './e2e-changed.mjs';

const source = [
  "describe('Checks', () => {",
  "  it('say which joints the simulation estimates', async () => {",
  '    await one();',
  '  });',
  '',
  "  it('ask before deleting a saved price (then fall back)', async () => {",
  '    await two();',
  '  });',
  '});',
].join('\n');

describe('the e2e tests a pull request touches', () => {
  it('reads the new-side lines of each hunk', () => {
    expect([...changedLines('@@ -6,2 +6,3 @@\n+x\n@@ -20 +21 @@\n+y')]).toEqual([6, 7, 8, 21]);
    expect([...changedLines('@@ -9,1 +8,0 @@\n-gone')]).toEqual([8]);
  });

  it('names only the tests whose lines changed, not the rest of the file', () => {
    expect(testsAt(source, new Set([7]))).toEqual(['ask before deleting a saved price (then fall back)']);
    expect(testsAt(source, new Set([1]))).toEqual([]);
  });

  it('escapes names into one pattern for -t', () => {
    expect(pattern(['a (b)', 'c.d'])).toBe('a \\(b\\)|c\\.d');
  });
});
