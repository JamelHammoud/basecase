import fs from 'node:fs';
import { expect, it } from 'vitest';
import { testsAt } from './e2e-changed.mjs';

it('selects both production kit download walkthroughs from their parameterized declaration', () => {
  const source = fs.readFileSync(new URL('../e2e/kit.e2e.test.ts', import.meta.url), 'utf8');
  const lines = source.split('\n');
  const declaration = lines.findIndex((line) => line.startsWith('it.each(')) + 1;
  const selection = testsAt(source, new Set([declaration]));

  expect(declaration).toBeGreaterThan(0);
  expect(selection.fallback).toBe(false);
  expect(selection.pattern).toBeTruthy();

  for (const surface of ['desktop', 'web']) {
    expect(
      new RegExp(selection.pattern).test(
        `downloads a reconciled kit through Export on ${surface} with matching packing, guide, servo map and 3MF mesh`,
      ),
    ).toBe(true);
  }

  const wholeFile = testsAt(source, new Set(lines.map((_, index) => index + 1)));

  expect(wholeFile.fallback).toBe(true);
});
