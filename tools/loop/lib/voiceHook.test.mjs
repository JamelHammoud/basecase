import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from './sh.mjs';
import { newPages } from './voiceHook.mjs';

const dirs = [];

const git = (dir, ...args) =>
  run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir });

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

function branchWith(committed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-hook-'));

  dirs.push(dir);
  git(dir, 'init', '-q');
  Object.entries(committed).forEach(([file, text]) => write(dir, file, text));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'branch so far');

  return dir;
}

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('newPages', () => {
  it('voices only the pages this commit adds, never a page an earlier commit or main already has', () => {
    const dir = branchWith({
      'site/content/help/agent-limits.md': 'The agent’s only tools are the CAD tools.\n',
      'site/content/changelog/2026-11-14-snap.md': 'You can now snap parts.\n',
    });

    write(dir, 'site/content/help/agent-limits.md', 'The agent’s only tools are the CAD tools, and search.\n');
    write(dir, 'site/content/changelog/2026-11-14-snap.md', 'You can now snap parts to a grid.\n');
    write(dir, 'site/content/help/snap-parts.md', 'Snap parts to the grid.\n');
    write(dir, 'site/content/help/café menu.md', 'Open the café menu.\n');
    write(dir, 'site/content/blog/snapping.md', 'Why we snap.\n');
    git(dir, 'add', 'site/content/blog/snapping.md');
    write(dir, 'site/public/help/snap-parts/grid.png', 'png');
    write(dir, 'src/Snap.tsx', 'export {};\n');

    expect(newPages(dir)).toEqual([
      'site/content/blog/snapping.md',
      'site/content/help/café menu.md',
      'site/content/help/snap-parts.md',
    ]);
  });

  it('leaves a revision that only edits pages the branch already has as written', () => {
    const dir = branchWith({ 'site/content/help/snap-parts.md': 'Snap parts to the grid.\n' });

    write(dir, 'site/content/help/snap-parts.md', 'Snap parts to the 5 mm grid.\n');

    expect(newPages(dir)).toEqual([]);
  });
});
