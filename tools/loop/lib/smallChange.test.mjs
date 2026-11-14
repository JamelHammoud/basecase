import { describe, expect, it } from 'vitest';
import { isSmall } from './smallChange.mjs';

const pull = (paths, additions, deletions, labels = []) => ({
  files: paths.map((path) => ({ path })),
  additions,
  deletions,
  labels: labels.map((name) => ({ name })),
});

describe('pull requests too small for an agent review', () => {
  it('takes a package bump and a few changed lines of copy', () => {
    expect(isSmall(pull(['package.json', 'package-lock.json'], 400, 400, ['loop:update']))).toBe(true);
    expect(isSmall(pull(['src/components/ExportMenu.tsx', 'site/content/help/export.md'], 6, 6))).toBe(true);
  });

  it('reviews anything larger, wider, or touching the loop, CI, IPC or dependencies', () => {
    expect(isSmall(pull(['src/a.ts'], 40, 2))).toBe(false);
    expect(isSmall(pull(['a', 'b', 'c', 'd', 'e', 'f'], 6, 0))).toBe(false);
    expect(isSmall(pull(['electron/main.mjs'], 2, 2))).toBe(false);
    expect(isSmall(pull(['tools/loop/lanes/merge.mjs'], 2, 2))).toBe(false);
    expect(isSmall(pull([], 0, 0))).toBe(false);
  });
});
