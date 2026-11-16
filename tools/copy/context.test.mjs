import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { copyDiffOfRange, copyOccurrences, formatCopyDiff } from '../copy-diff.mjs';
import { reviewPrompt } from '../loop/lib/reviewPrompt.mjs';
import { copyReport, copyReviewEvidence } from '../loop/lib/copy.mjs';

it('carries bounded revision source through the local report and review prompt without changing accounting', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-context-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

    if (result.status !== 0) throw new Error(result.stderr);

    return result.stdout.trim();
  };
  const write = (file, source) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), source);
  };
  const commit = () => {
    git('add', '-A');
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
  };

  try {
    git('init', '-qb', 'main');
    write('src/Old.tsx', 'export const Old = () => (\n<section>\n<button>Close</button>\n</section>\n);');
    write('src/Deleted.tsx', '<p>Deleted source caption</p>');
    write('src/Change.tsx', 'function Recovery() { return <p>Printer failed</p>; }');
    commit();
    git('checkout', '-qb', 'step');
    git('mv', 'src/Old.tsx', 'src/Renamed.tsx');
    write(
      'src/Renamed.tsx',
      'export const Old = () => (\n<section>\n<button title="Close control">Close</button>\n</section>\n);',
    );
    fs.rmSync(path.join(cwd, 'src/Deleted.tsx'));
    write('src/Change.tsx', 'function Recovery() { return <p>Connect the printer in Settings</p>; }');
    write(
      'src/Scopes.tsx',
      'const caption = { title: "Heading" }; function Helper() { return null; }\nexport const Inline = () => <p>Welcome</p>;',
    );
    write(
      'src/Panel.tsx',
      [
        "import { Child } from './Child';",
        'export function Panel({ ready, total, rows }) {',
        '  return <section>',
        '    <h2>Supplies</h2><p>Supplies</p>',
        '    <output>{total}</output><p>Total supply cost</p>',
        '    <Button title="Save" onClick={function handleSave() { save(); }}>Save</Button>',
        '    <p>Choose a printer in Settings</p>',
        '    <button aria-label="Close panel"><Icon /></button>',
        '    {ready ? <p>Ready</p> : <p>Connect a printer</p>}',
        '    <Child />',
        '    {rows.map(row => <button>Remove</button>)}',
        '    <button>Remove</button>',
        '  </section>;',
        '}',
      ].join('\n'),
    );
    write('src/Large.tsx', `export function Large() { return <>${'<p>Extra caption</p>\n'.repeat(500)}</>; }`);
    commit();

    const head = git('rev-parse', 'HEAD');
    const diff = copyDiffOfRange({ cwd, base: 'main', head });
    const occurrences = copyOccurrences(diff);
    const body = occurrences.added.map(({ text }) => `copy: "${text}" - Names the control at each location`).join('\n');
    const review = copyReport(cwd, { base: 'main', head, body });
    const local = formatCopyDiff(diff);

    write('src/Panel.tsx', '<p>WORKTREE ONLY</p>');
    git('checkout', '-qf', 'main');

    expect(formatCopyDiff(copyDiffOfRange({ cwd, base: 'main', head }))).toBe(local);
    expect(local).not.toContain('WORKTREE ONLY');
    expect(local).toContain('Panel');
    expect(local).toContain('Recovery');
    expect(local).toContain('src/Renamed.tsx / Old');
    expect(local).toContain('src/Scopes.tsx / <module>');
    expect(local).toContain('src/Scopes.tsx / Inline');
    expect(local.match(/^src\/Panel.tsx \/ Panel$/gm)).toHaveLength(1);
    expect(diff.context.some(({ heading }) => heading.endsWith('/ handleSave'))).toBe(false);
    expect(diff.context.some(({ heading }) => heading.includes('Deleted.tsx'))).toBe(false);
    expect(diff.changed).toContainEqual(
      expect.objectContaining({ after: expect.objectContaining({ text: 'Connect the printer in Settings' }) }),
    );
    expect(local).toContain('<output>{total}</output>');
    expect(local).toContain('ready ?');
    expect(local).toContain('<Child />');
    expect(local).toContain('aria-label="Close panel"');
    expect(local).toContain('Choose a printer in Settings');
    expect(local).toContain('proximity');
    expect(local).toContain('unresolved conditions');
    expect(local).toContain('imported children');
    expect(local).toContain('omitted');
    expect(local.length - formatCopyDiff({ ...diff, context: undefined }).length).toBeLessThanOrEqual(6000);
    expect(occurrences.added.filter(({ text }) => text === 'Remove')).toHaveLength(2);
    expect(occurrences.added.some(({ text }) => text === 'Close')).toBe(false);
    expect(occurrences.removed).toContainEqual(expect.objectContaining({ file: 'src/Deleted.tsx', line: 1 }));

    const prompt = reviewPrompt({
      pull: { number: 1414, title: 'Fixture', body },
      where: 'Compared revision',
      copy: review,
      duplicates: 'No duplicates',
      fix: 'Fix findings',
      diff: 'Controlled diff',
    });

    expect(prompt).toContain(review.text);
    expect(prompt).toContain(body);
    expect(prompt).toContain('Compared revision');
    expect(prompt).toContain('Its diff against main:\n\nControlled diff');
    expect(review.net).toBe(diff.net);
    expect(review.text).toContain('why: Names the control');
    expect(copyReviewEvidence(review)).toContain(review.text);
    expect(copyReviewEvidence(review)).toMatch(/source proximity/i);
    expect(copyOccurrences(copyDiffOfRange({ cwd, base: 'main', head }))).toEqual(occurrences);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
