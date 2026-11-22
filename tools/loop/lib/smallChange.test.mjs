import { describe, expect, it } from 'vitest';
import { isSmall } from './smallChange.mjs';

const pull = (paths, additions, deletions, labels = []) => ({
  files: paths.map((path) => ({ path })),
  additions,
  deletions,
  labels: labels.map((name) => ({ name })),
});

describe('pull requests too small for an agent review', () => {
  it('takes a package bump and a few changed lines of help', () => {
    expect(isSmall(pull(['package.json', 'package-lock.json'], 400, 400, ['loop:update']))).toBe(true);
    expect(isSmall(pull(['site/content/help/export.md'], 6, 6))).toBe(true);
    expect(isSmall(pull(['site/content/help/export.md'], 15, 15))).toBe(true);
  });

  it.each([
    'src/components/BuildPanel.tsx',
    'src/design-system/NumberInput.tsx',
    'src/index.css',
    'src/workspace/viewCommands.ts',
  ])('reviews even one changed line in %s', (file) => {
    expect(isSmall(pull([file], 1, 0))).toBe(false);
    expect(isSmall(pull([file], 1, 0, ['loop:update']))).toBe(false);
  });

  it('reviews anything larger, wider, or touching the loop, CI, IPC or dependencies', () => {
    expect(isSmall(pull(['src/a.ts'], 40, 2))).toBe(false);
    expect(isSmall(pull(['site/content/help/export.md'], 15, 16))).toBe(false);
    expect(isSmall(pull(['a', 'b', 'c', 'd', 'e', 'f'], 6, 0))).toBe(false);
    expect(isSmall(pull(['electron/main.mjs'], 2, 2))).toBe(false);
    expect(isSmall(pull(['tools/loop/lanes/merge.mjs'], 2, 2))).toBe(false);
    expect(isSmall(pull([], 0, 0))).toBe(false);
  });
});

it.each([
  'verify/manifest.json',
  'verify/gates/s3a-motor-kit.mjs',
  'tools/release/sign.mjs',
  'hw/crates/robot-daemon/src/lib.rs',
  '.github/workflows/check.yml',
  'electron/updates.mjs',
])('requires review for protected %s even with an update label', (file) => {
  expect(isSmall(pull([file], 1, 1))).toBe(false);
  expect(isSmall(pull([file], 1, 1, ['loop:update']))).toBe(false);
});

it('limits the update shortcut to a nonempty dependency-only diff', () => {
  expect(isSmall(pull([], 0, 0, ['loop:update']))).toBe(false);
  expect(isSmall(pull(['tools/loop/lib/agent.mjs'], 1, 0, ['loop:update']))).toBe(false);
  expect(isSmall(pull(['site/content/help/export.md'], 40, 0, ['loop:update']))).toBe(false);
});
