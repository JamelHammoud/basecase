import { describe, expect, it } from 'vitest';
import { changelogProblems, copyProblems, coversOf, followUpPrompt, helpProblems } from './preflight.mjs';

const string = (text, line = 1) => ({ text, file: 'src/components/Row.tsx', line, repeat: false });

describe('copyProblems', () => {
  it('asks for a reason for each new string when the change adds more than it removes', () => {
    const problems = copyProblems({ added: [string('Roll Back'), string('More', 2)], removed: [] });

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/"Roll Back" \(src\/components\/Row.tsx:1\) is a new string/);
  });

  it('takes the reasons from the answer’s copy field', () => {
    const copy = [
      { string: 'Roll Back', why: 'The only way to undo a calibration' },
      { string: 'More', why: 'The icon button’s accessible name' },
    ];

    expect(copyProblems({ added: [string('Roll Back'), string('More', 2)], removed: [], copy })).toEqual([]);
  });

  it('needs no reasons when the change removes as many strings as it adds', () => {
    expect(copyProblems({ added: [string('Delete')], removed: [string('Remove')] })).toEqual([]);
  });

  it('flags a banned word even with a reason', () => {
    const copy = [{ string: 'No parts yet', why: 'Empty Parts list' }];

    expect(copyProblems({ added: [string('No parts yet')], removed: [], copy })[0]).toMatch(/§3c bans/);
  });
});

describe('changelogProblems', () => {
  const entry = {
    status: 'A',
    from: 'site/content/changelog/2026-11-13-x.md',
    to: 'site/content/changelog/2026-11-13-x.md',
  };

  it('flags a new changelog entry on a change that never gets one', () => {
    expect(changelogProblems({ kind: 'refine', changes: [entry] })[0]).toMatch(/`refine` change never gets one/);
    expect(changelogProblems({ kind: 'fix', changes: [entry] })).toHaveLength(1);
  });

  it('lets features and integrations add one, and anyone edit an old one', () => {
    expect(changelogProblems({ kind: 'feature', changes: [entry] })).toEqual([]);
    expect(changelogProblems({ kind: 'integration', changes: [entry] })).toEqual([]);
    expect(changelogProblems({ kind: 'refine', changes: [{ ...entry, status: 'M' }] })).toEqual([]);
  });

  it('says nothing when the kind is unknown', () => {
    expect(changelogProblems({ kind: null, changes: [entry] })).toEqual([]);
  });
});

describe('coversOf', () => {
  it('reads the covers list from front matter', () => {
    const source =
      '---\ntitle: Import a file\ncovers:\n  - src/workspace/importRoute.ts\n  - src/components/annotations/\nrelated:\n  - other\n---\n\nBody\n';

    expect(coversOf(source)).toEqual(['src/workspace/importRoute.ts', 'src/components/annotations/']);
  });

  it('is empty without covers or front matter', () => {
    expect(coversOf('---\ntitle: A\n---\nBody')).toEqual([]);
    expect(coversOf('Body')).toEqual([]);
  });
});

describe('helpProblems', () => {
  const article = {
    path: 'site/content/help/price-the-parts.md',
    covers: ['src/components/build/CheckSheet.tsx', 'src/components/annotations/'],
  };
  const change = (status, from, to = from) => ({ status, from, to });

  it('flags a covers path the change renames or deletes', () => {
    const renamed = helpProblems({
      changes: [change('R', 'src/components/build/CheckSheet.tsx', 'src/components/build/PriceSheet.tsx')],
      articles: [article],
    });
    const deleted = helpProblems({
      changes: [change('D', 'src/components/build/CheckSheet.tsx')],
      articles: [article],
    });

    expect(renamed[0]).toMatch(/renames it to src\/components\/build\/PriceSheet.tsx/);
    expect(deleted[0]).toMatch(/this change deletes it/);
  });

  it('asks for a reread when covered code changes and the article does not', () => {
    const problems = helpProblems({
      changes: [change('M', 'src/components/annotations/Pin.tsx')],
      articles: [article],
    });

    expect(problems[0]).toMatch(/covers src\/components\/annotations\/Pin.tsx, which this change edits/);
  });

  it('is quiet when the article changes too, or only tests change', () => {
    const edited = [change('M', 'src/components/annotations/Pin.tsx'), change('M', article.path)];
    const tests = [change('M', 'src/components/annotations/Pin.test.tsx')];

    expect(helpProblems({ changes: edited, articles: [article] })).toEqual([]);
    expect(helpProblems({ changes: tests, articles: [article] })).toEqual([]);
  });
});

describe('followUpPrompt', () => {
  it('lists the problems, the first answer and the task', () => {
    const prompt = followUpPrompt({ prompt: 'Build #12', output: { title: 'Add X' }, problems: ['one', 'two'] });

    expect(prompt).toContain('- one\n- two');
    expect(prompt).toContain('"title": "Add X"');
    expect(prompt).toContain('Build #12');
  });
});
