import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { completeHelpHistory, helpCommitDates } from './gitDates.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'help-dates-'));
const repo = path.join(dir, 'source');
const file = 'site/content/help/a file.md';
const git = (cwd, args, options = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();

function record(day, parent) {
  git(repo, ['add', '.']);

  const tree = git(repo, ['write-tree']);
  const parents = parent ? ['-p', parent] : [];
  const commit = git(repo, ['commit-tree', tree, ...parents, '-m', 'Update articles'], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_AUTHOR_DATE: '2026-11-01T10:00:00Z',
      GIT_COMMITTER_DATE: `${day}T10:00:00Z`,
    },
  });

  git(repo, ['update-ref', 'refs/heads/main', commit]);

  return commit;
}

mkdirSync(path.join(repo, 'site/content/help'), { recursive: true });
git(repo, ['init', '-q']);
git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
writeFileSync(path.join(repo, file), 'Article.');

const first = record('2026-11-02');

writeFileSync(path.join(repo, 'site/content/help/b.md'), 'Another article.');
record('2026-11-03', first);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('help commit dates', () => {
  it('reads each article from git and leaves an untracked article to the date fallback', async () => {
    const dates = await helpCommitDates(repo, [file, 'site/content/help/b.md', 'site/content/help/new.md']);

    expect(dates[file]).toBe(git(repo, ['log', '-1', '--format=%cs', '--', file]));
    expect(dates[file]).toBe('2026-11-02');
    expect(dates['site/content/help/b.md']).toBe('2026-11-03');
    expect(dates['site/content/help/new.md']).toBeUndefined();
    expect(await helpCommitDates(path.join(dir, 'absent'), [file])).toEqual({});
  });

  it('completes a shallow build checkout before reading dates of unchanged articles', async () => {
    const checkout = path.join(dir, 'checkout');

    git(dir, ['clone', '-q', '--depth=1', pathToFileURL(repo).href, checkout]);
    expect((await helpCommitDates(checkout, [file]))[file]).toBe('2026-11-03');
    completeHelpHistory(checkout);
    expect(git(checkout, ['rev-parse', '--is-shallow-repository'])).toBe('false');
    expect((await helpCommitDates(checkout, [file]))[file]).toBe('2026-11-02');
    expect(() => completeHelpHistory(checkout)).not.toThrow();
    expect(() => completeHelpHistory(path.join(dir, 'absent'))).not.toThrow();
  });
});
