import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { declarations, testsAt } from './e2e-changed.mjs';

it('gives every current browser declaration a precise pattern or an explicit file fallback', () => {
  const files = execFileSync('git', ['ls-files', 'e2e/*.e2e.test.ts'], { encoding: 'utf8' }).trim().split('\n');
  const unresolved = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const parsed = declarations(source);

    expect(parsed.invalid, file).toBe(false);
    expect(parsed.tests.length, file).toBeGreaterThan(0);

    for (const test of parsed.tests) {
      const selection = testsAt(source, new Set([test.start]));

      expect(Boolean(selection.pattern) || selection.fallback, `${file}:${test.start}`).toBe(true);

      if (test.pattern === null) unresolved.push(file);
    }
  }

  expect(unresolved).toEqual(['e2e/passiveFixtures.e2e.test.ts']);
});
