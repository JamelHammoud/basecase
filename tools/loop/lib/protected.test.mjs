import { describe, expect, it } from 'vitest';
import { protectedFiles } from './protected.mjs';
import { pullBody } from './pull.mjs';

const patch = (file, lines) =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, '@@ -1 +1 @@', ...lines].join('\n');

const diff = [
  patch('.github/workflows/check.yml', ['+concurrency:', '+  cancel-in-progress: true']),
  patch('tools/loop/lanes/market.mjs', ['+const TAKEN = 1;']),
  patch('electron/backend/fileRoutes.mjs', ['-  const id = raw;', '+  const id = checkedFileId(raw);']),
  patch('src/ui/Label.tsx', ['   const guardBridge = 1;', '+const x = 2;']),
  patch('verify/gates.mjs', ['-export const gates = [];']),
].join('\n');

describe('protectedFiles', () => {
  it('names files under a protected path and files whose changed lines use a guard', () => {
    expect(protectedFiles(diff)).toEqual([
      '.github/workflows/check.yml',
      'electron/backend/fileRoutes.mjs',
      'verify/gates.mjs',
    ]);
  });

  it('ignores a guard named only in unchanged context', () => {
    expect(protectedFiles(patch('src/ui/Label.tsx', ['   guardBridge(app);', '+const x = 2;']))).toEqual([]);
  });

  it('lists them in the pull request body', () => {
    const change = { kind: 'loop', title: 'Cancel stale runs', summary: 'S.', why: 'W.', checked: 'C.' };
    const body = pullBody(change, { branch: 'loop/test', protectedPaths: protectedFiles(diff) });

    expect(body).toContain('## Protected paths');
    expect(body).toContain('`.github/workflows/check.yml`, `electron/backend/fileRoutes.mjs`, `verify/gates.mjs`.');
    expect(pullBody(change, { branch: 'loop/test' })).not.toContain('## Protected paths');
  });
});
