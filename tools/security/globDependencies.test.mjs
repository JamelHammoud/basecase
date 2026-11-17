import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const repetitions = ['+(*)', '*(*)', '+(*a)', '*(*a)', '+(a*)', '*(a*)', '+(a*b)', '+(*[ab])', '+(@(*a))'];

describe('toolchain glob dependencies', () => {
  it('rejects repeated-extglob attack inputs in a bounded process', () => {
    const letters = 'a'.repeat(80);
    const attacks = [
      ['+(*)', `${letters}/`],
      ['*(*)', `${letters}/`],
      ['+(*a)', `${letters}!`],
      ['*(*a)', `${letters}!`],
      ['+(a*)', `${letters}/`],
      ['*(a*)', `${letters}/`],
      ['+(a*b)', `${'ab'.repeat(40)}!`],
      ['+(*[ab])', `${letters}!`],
      ['+(@(*a))', `${letters}!`],
      ['+(*)b', `${letters}!`],
      ['*(*)b', `${letters}!`],
      ['+(*a)c', `${letters}!`],
      ['+(**)', `${letters}/.`],
      ['+(**a)', `${letters}!`],
      ['+(?(*a))', `${letters}!`],
      ['+(*a/b)', `${letters}!`],
    ];
    const script = `
      const assert = require('node:assert/strict');
      const pm = require(${JSON.stringify(require.resolve('picomatch'))});
      for (const options of [{}, { windows: true }, { capture: true }]) {
        for (const [pattern, input] of ${JSON.stringify(attacks)}) {
          assert.equal(pm.isMatch(input, pattern, options), false, pattern);
        }
      }
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      timeout: 2000,
      windowsHide: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('preserves supported wildcard repetition across matching options', () => {
    const alphabet = ['a', 'b', '.', '/', '*'];
    const pairs = alphabet.flatMap((a) => alphabet.map((b) => a + b));
    const inputs = ['', ...alphabet, ...pairs, ...pairs.flatMap((a) => alphabet.map((b) => a + b))];

    for (const options of [{}, { dot: true }, { windows: true }, { bash: true }, { capture: true }]) {
      for (const pattern of repetitions) {
        const guarded = picomatch(pattern, options);
        const original = picomatch(pattern, { ...options, maxExtglobRecursion: false });

        expect(inputs.map((input) => guarded(input))).toEqual(inputs.map((input) => original(input)));
      }
    }
  });

  it('preserves literal stars and refuses unsupported repeated wildcard syntax', () => {
    for (const pattern of ['+(a\\*b)', '+("*a")', '+([*]a)']) {
      expect(picomatch.makeRe(pattern).source).toBe(picomatch.makeRe(pattern, { maxExtglobRecursion: false }).source);
    }

    for (const pattern of ['+(?(*a))', '+(*a/b)', '+(*{a,b})']) {
      expect(picomatch.isMatch(pattern, pattern)).toBe(true);
    }
  });

  it('selects files through the installed glob consumer with braces, extglobs, dotfiles and ignores', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'basecase-glob-'));

    try {
      await mkdir(path.join(dir, 'src', 'nested'), { recursive: true });
      await mkdir(path.join(dir, 'node_modules'));
      await Promise.all(
        ['src/a.ts', 'src/b.tsx', 'src/nested/c.mjs', 'src/.hidden.ts', 'src/a.test.ts', 'node_modules/d.ts'].map(
          (file) => writeFile(path.join(dir, file), ''),
        ),
      );

      expect(
        (
          await glob(['**/*.{ts,tsx,mjs}', '!**/*.test.ts'], { cwd: dir, dot: true, ignore: ['node_modules/**'] })
        ).sort(),
      ).toEqual(['src/.hidden.ts', 'src/a.ts', 'src/b.tsx', 'src/nested/c.mjs']);
      expect((await glob('src/@(a|b).@(ts|tsx)', { cwd: dir })).sort()).toEqual(['src/a.ts', 'src/b.tsx']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
