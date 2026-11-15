import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = [];
const git = (cwd, args) =>
  execFileSync('git', ['-c', 'user.name=me', '-c', 'user.email=me@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function comparisonFixture() {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-cli-test-'));
  const bench = path.join(root, 'bench');

  temporary.push(tree);
  fs.cpSync(bench, path.join(tree, 'bench'), {
    recursive: true,
    filter: (source) =>
      !/\.test\.mjs$/.test(source) && !['data', 'runs'].includes(path.relative(bench, source).split(path.sep)[0]),
  });
  fs.mkdirSync(path.join(tree, 'electron'));
  fs.copyFileSync(path.join(root, 'electron/plural.mjs'), path.join(tree, 'electron/plural.mjs'));
  fs.writeFileSync(path.join(tree, 'electron/cad-agent-prompt.mjs'), 'export default "Build robots.";\n');
  fs.writeFileSync(path.join(tree, 'package-lock.json'), '{}\n');
  fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules')), path.join(tree, 'node_modules'), 'dir');
  git(tree, ['init', '-q', '-b', 'main']);
  git(tree, ['add', 'bench/micro', 'electron/cad-agent-prompt.mjs', 'package-lock.json']);
  git(tree, ['commit', '-q', '-m', 'Fixture']);
  fs.writeFileSync(path.join(tree, 'electron/cad-agent-prompt.mjs'), 'export default "Build serviceable robots.";\n');

  return tree;
}

afterEach(() => {
  for (const tree of temporary.splice(0)) fs.rmSync(tree, { recursive: true, force: true });
});

describe('comparison command', () => {
  it('persists a deadline report and removes the reference worktree before starting an app', () => {
    const tree = comparisonFixture();
    const runsDir = path.join(tree, 'reports');
    const child = spawnSync(
      process.execPath,
      [
        path.join(tree, 'bench/compare.mjs'),
        '--against',
        'main',
        '--tasks',
        'A1',
        '--minutes',
        '0.00000001',
        '--runs-dir',
        runsDir,
        '--run',
        'deadline',
        '--no-cache',
      ],
      { cwd: tree, encoding: 'utf8', timeout: 3000 },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);

    const results = JSON.parse(fs.readFileSync(path.join(runsDir, 'deadline/results.json'), 'utf8'));
    const report = fs.readFileSync(path.join(runsDir, 'deadline/report.md'), 'utf8');

    expect(results.plan.stop).toBe('deadline');
    expect(results.plan.rounds).toBe(0);
    expect(results.results).toEqual([]);
    expect(results.arms).toHaveLength(2);
    expect(results.arms[0].harness).not.toBe(results.arms[1].harness);
    expect(report).toContain('# working tree vs main');
    expect(report).toMatch(/deadline|time limit/i);
    expect(git(tree, ['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(1);
    expect(child.stdout).not.toContain('dev server up');
    expect(child.stderr).not.toContain('CAD kernel preflight');
  });
});
