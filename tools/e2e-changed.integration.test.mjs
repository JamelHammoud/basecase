import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedLines, declarations, testsAt } from './e2e-changed.mjs';
import { cases, executed, fixture, kit, root, vitest } from './e2e-changed.fixtures.mjs';

const selection = (fix, base) =>
  JSON.parse(
    execFileSync(process.execPath, [path.join(root, 'tools/e2e-changed.mjs'), base], {
      cwd: fix.dir,
      encoding: 'utf8',
    }),
  );

describe('browser selector entry point', () => {
  it('replays the deleted kit declaration and selects desktop and web from real collection', () => {
    const parsed = declarations(kit);
    const result = testsAt(kit, new Set([parsed.tests[0].start]));
    const fix = fixture();

    try {
      const imports = `import { it, expect } from ${JSON.stringify(path.join(root, 'node_modules/vitest/dist/index.js'))};\n`;

      fix.write('e2e/probe.e2e.test.ts', imports);

      const base = fix.revision();

      fix.write(
        'e2e/probe.e2e.test.ts',
        `${imports}${kit.slice(kit.indexOf('it.each'), kit.indexOf('async (surface)'))}() => { expect(true).toBe(true); });`,
      );

      fix.revision();

      const found = selection(fix, base);

      expect(found.pattern).toBe(result.pattern);
      expect(found.fallbackFiles).toEqual([]);

      const report = vitest(fix, ['run', ...found.files, '-t', found.pattern]);

      expect(executed(report)).toEqual([
        'exports an arm through Export on desktop with matching manufacturing identities',
        'exports an arm through Export on web with matching manufacturing identities',
      ]);
    } finally {
      fix.close();
    }
  });

  it('compares every generated title against Vitest and runs only changed cases through the Check invocation', () => {
    const fix = fixture();

    try {
      fix.write('e2e/probe.e2e.test.ts', cases);
      fix.write('e2e/deleted.e2e.test.ts', "import { it } from 'vitest'; it('gone', () => {});");

      const base = fix.revision();
      const edited = cases.replace('expect(true).toBe(true); },\n    );', 'expect(1).toBe(1); },\n    );');

      fix.write('e2e/probe.e2e.test.ts', edited);
      fs.unlinkSync(path.join(fix.dir, 'e2e/deleted.e2e.test.ts'));

      const changedHead = fix.revision();
      const found = selection(fix, base);
      const report = vitest(fix, ['run', ...found.files, '-t', found.pattern]);

      expect(found.fallbackFiles).toEqual([]);
      expect(executed(report)).toEqual([
        'outer > inner > exports an arm through Export on desktop with matching manufacturing identities',
        'outer > inner > exports an arm through Export on web with matching manufacturing identities',
      ]);

      const collected = vitest(fix, ['run']);
      const all = testsAt(edited, new Set(edited.split('\n').map((_, index) => index + 1)));

      expect(executed(collected)).toHaveLength(11);
      expect(executed(collected).every((name) => new RegExp(all.pattern).test(name))).toBe(true);
      expect(executed(collected)).toContain('outer > inner > styled  text');
      fix.write(
        'e2e/probe.e2e.test.ts',
        edited.replace(
          "it('neighbor before', () => { expect(true).toBe(true)",
          "it('neighbor before', () => { expect(1).toBe(1)",
        ),
      );
      fix.revision();

      const direct = selection(fix, changedHead);

      expect(direct.fallbackFiles).toEqual([]);
      expect(executed(vitest(fix, ['run', ...direct.files, '-t', direct.pattern]))).toEqual([
        'outer > neighbor before',
      ]);
    } finally {
      fix.close();
    }
  });

  it('falls back only within the affected file for unresolved titles and shared helpers', () => {
    const fix = fixture();

    try {
      fix.write('e2e/probe.e2e.test.ts', cases);

      const base = fix.revision();

      fix.write('e2e/probe.e2e.test.ts', cases.replace("'wrapped'", "String('wrapped')"));
      fix.revision();

      const found = selection(fix, base);

      expect(found.files).toEqual([]);
      expect(found.fallbackFiles).toEqual(['e2e/probe.e2e.test.ts']);
      expect(executed(vitest(fix, ['run', ...found.fallbackFiles, '-t', '.*']))).toHaveLength(11);
      expect(testsAt("it('a', () => {});\nconst helper = 2;\nit('b', () => {});", changedLines('@@ -2 +2 @@'))).toEqual(
        { pattern: '', fallback: true },
      );
    } finally {
      fix.close();
    }
  });
  it('falls back for shared setup removed in the same hunk as a changed declaration', () => {
    const fix = fixture();

    try {
      fix.write(
        'e2e/probe.e2e.test.ts',
        cases.replace("  it('neighbor before'", "  const helper = 2;\n  it('neighbor before'"),
      );

      const base = fix.revision();

      fix.write('e2e/probe.e2e.test.ts', cases.replace("'neighbor before'", "'renamed neighbor'"));
      fix.revision();

      const found = selection(fix, base);

      expect(found).toEqual({ files: [], pattern: '', fallbackFiles: ['e2e/probe.e2e.test.ts'] });
      expect(executed(vitest(fix, ['run', ...found.fallbackFiles, '-t', '.*']))).toHaveLength(11);
    } finally {
      fix.close();
    }
  });
  it('does not assign removed tests or files to unchanged neighbors', () => {
    const fix = fixture();

    try {
      const source = cases.replace("  it('neighbor before'", "  it('removed', () => {});\n  it('neighbor before'");

      fix.write('e2e/probe.e2e.test.ts', source);
      fix.write('e2e/removed.e2e.test.ts', cases);

      const base = fix.revision();

      fix.write('e2e/probe.e2e.test.ts', cases);
      fs.unlinkSync(path.join(fix.dir, 'e2e/removed.e2e.test.ts'));
      fix.revision();
      expect(selection(fix, base)).toEqual({ files: [], pattern: '', fallbackFiles: [] });
    } finally {
      fix.close();
    }
  });
});
