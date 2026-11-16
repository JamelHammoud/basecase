import { describe, expect, it } from 'vitest';
import { changedLines, sharedDeletions, testsAt } from './e2e-changed.mjs';

const select = (source, needle) =>
  testsAt(source, new Set([source.slice(0, source.indexOf(needle)).split('\n').length]));
const matches = (selection, name) => new RegExp(selection.pattern).test(name);

describe('changed browser declarations', () => {
  it('keeps insertion lines and deletion gaps distinct', () => {
    expect([...changedLines('@@ -6,2 +6,3 @@\n+x\n@@ -20 +21 @@\n+y')]).toEqual([6, 7, 8, 21]);
    expect([...changedLines('@@ -9,1 +8,0 @@\n-gone')]).toEqual([8.5]);
  });

  it('bounds direct tests, multiline names and nested suites', () => {
    const source = `describe('outer', () => {
  it('neighbor', () => {});
  describe('inner', () => {
    test(
      'a (title)',
      () => {
        action();
      },
    );
    const helper = 2;
    it('unchanged', () => {});
  });
});`;
    const result = select(source, 'action');

    expect(matches(result, 'outer > inner > a (title)')).toBe(true);
    expect(matches(result, 'outer > inner > a (title) extra')).toBe(false);
    expect(select(source, 'helper').pattern).toBe('');
    expect(select(source, "describe('inner'").fallback).toBe(true);
  });

  it('preserves escaped and template titles without interpreting ordinary percent signs', () => {
    const source = 'it(`line\\nquote\\` 100%`, () => { action(); });';

    expect(matches(select(source, 'action'), 'line\nquote` 100%')).toBe(true);
    expect(select('it(`dynamic ${value}`, () => {});', 'dynamic').fallback).toBe(true);
  });

  it('recognizes chained modifiers, array and tagged tables, and platform wrappers', () => {
    const declarations = [
      "it.each([false, true])('mixed %s', () => {});",
      "test.skipIf(false).each([[1, 2]])('sum %i %d %#', () => {});",
      "it.each`name | value\n${'a'} | ${1}`('row $name $value', () => {});",
      "itUnlessWindows('wrapped', () => {});",
      "test.runIf(true)('conditional', () => {});",
      "it.concurrent.fails('failure', () => {});",
      "it.only.each([1])('only %s', () => {});",
      "test.skip('skipped', () => {});",
      "it.todo('todo');",
      "test.sequential('sequential', () => {});",
      "test.for([1])('for %i', () => {});",
    ];
    const names = [
      'mixed false',
      'sum 1 2 0',
      'row a 1',
      'wrapped',
      'conditional',
      'failure',
      'only 1',
      'skipped',
      'todo',
      'sequential',
      'for 1',
    ];

    for (const [index, source] of declarations.entries()) {
      const result = testsAt(source, new Set([1]));

      expect(result.fallback).toBe(false);
      expect(matches(result, names[index])).toBe(true);
    }
  });

  it('falls back for unresolved declarations and never assigns a deleted test to its neighbors', () => {
    expect(select('it(title, callback);', 'title').fallback).toBe(true);
    expect(testsAt("it('before', () => {});\nit('after', () => {});", new Set([1.5])).pattern).toBe('');
    expect(testsAt("it('body', () => {\n  action();\n});", new Set([1.5])).pattern).not.toBe('');
    expect(select('it.each(rows)(title, callback);', 'title').fallback).toBe(true);
  });
  it('distinguishes removed setup from removed declarations', () => {
    const source = "const helper = 2;\nit('removed', () => {});\n";

    expect(sharedDeletions(source, '@@ -1 +0,0 @@')).toBe(true);
    expect(sharedDeletions(source, '@@ -2 +1,0 @@')).toBe(false);
  });
});
