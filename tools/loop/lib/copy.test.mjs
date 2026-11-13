import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { copyNetOf, copyReport, copyReviewNote, copyTrend, copyTrendLine } from './copy.mjs';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-diff-'));

const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

  if (result.status !== 0) throw new Error(result.stderr);

  return result.stdout.trim();
};

const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

const commit = (message) => {
  git('add', '-A');
  git('-c', 'user.name=Loop', '-c', 'user.email=loop@example.com', 'commit', '-q', '-m', message);
};

git('init', '-q', '-b', 'main');
write('src/Panel.tsx', '<section>\n  <p>No parts</p>\n  <Button label="Close" />\n</section>;\n');
write('src/save.ts', "showToast('Saved the scene');\n");
commit('base');
git('checkout', '-q', '-b', 'feature');
write('src/Panel.tsx', '<section>\n  <Button label="Close" />\n  <Button label="Add Part" />\n</section>;\n');
write('src/save.ts', "showToast('Scene saved');\n");
write('src/Hint.tsx', '<p>Drag a part onto the grid</p>;\n');
write('src/Hint.test.tsx', "expect(getByText('Drag a part onto the grid')).toBeTruthy();\n");
commit('pull request');

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('copyReport, a dry run of the review lane on a fixture pull request', () => {
  it('lists what the pull request adds, changes and removes, with the net', () => {
    const report = copyReport(repo, { base: 'main', head: 'feature' });

    expect(report.net).toBe(1);
    expect(report.text).toBe(
      [
        '+ "Drag a part onto the grid"  src/Hint.tsx:1',
        '+ "Add Part"  src/Panel.tsx:3',
        '~ "Saved the scene" → "Scene saved"  src/save.ts:1',
        '- "No parts"  src/Panel.tsx:2',
        '',
        'Copy: 2 added, 1 changed, 1 removed, net +1',
      ].join('\n'),
    );
    expect(copyReviewNote(report)).toMatch(/why nothing on screen already says it/);
  });

  it('counts uncommitted work against the fork point when no head is given', () => {
    git('checkout', '-q', 'main');
    write('src/Draft.tsx', '<p>Draft</p>;\n');

    expect(copyReport(repo, { base: 'main', head: null }).text).toBe(
      '+ "Draft"  src/Draft.tsx:1\n\nCopy: 1 added, 0 changed, 0 removed, net +1',
    );
  });

  it('says it could not count instead of failing the review', () => {
    expect(copyReport(repo, { base: 'no-such-branch' })).toMatchObject({ net: null, text: /^Copy: not counted/ });
    expect(copyReviewNote({ net: null })).toMatch(/count failed/);
  });
});

describe('copyTrend', () => {
  const comment = (net) => ({ body: `### Review: pass (abc1234)\nFine.\n\n\`\`\`\nCopy: 1 added, net ${net}\n\`\`\`` });

  it('reads the latest review count of each merged pull request', () => {
    expect(copyNetOf([comment('+3'), { body: 'Thanks' }, comment('-1')])).toBe(-1);
    expect(copyNetOf([{ body: 'No count here' }])).toBeNull();
  });

  it('sums the week and names the trend in one line', () => {
    const pulls = [{ comments: [comment('+2')] }, { comments: [comment('-5')] }, { comments: [] }];
    const trend = copyTrend(pulls);

    expect(trend).toEqual({ total: -3, counted: 2, merged: 3 });
    expect(copyTrendLine(trend)).toBe('Copy this week: net -3 strings across 2 merged pull requests');
  });
});
