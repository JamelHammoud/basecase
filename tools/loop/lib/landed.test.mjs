import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { landedIn } from './landed.mjs';
import { run } from './sh.mjs';

const dirs = [];

const git = (dir, ...args) =>
  run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir });

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

function repoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'landed-'));

  dirs.push(dir);
  git(dir, 'init', '-q');
  write(dir, 'README.md', 'base');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  Object.entries(files).forEach(([file, text]) => write(dir, file, text));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'change');

  return dir;
}

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('landedIn', () => {
  it('reads entries and images whose names git would quote', () => {
    const dir = repoWith({
      'site/content/changelog/2026-11-13-café.md': '---\ntitle: Name a café\n---\n\nYou can now name a café.\n',
      'site/public/changelog/café/cover.png': 'png',
      'site/public/changelog/café/two words.png': 'png',
    });
    const landed = landedIn('HEAD~1..HEAD', dir);

    expect(landed.entries).toEqual([
      '**Name a café** (`site/content/changelog/2026-11-13-café.md`)\nYou can now name a café.',
    ]);
    expect(landed.images).toEqual(['site/public/changelog/café/cover.png', 'site/public/changelog/café/two words.png']);
    expect(landed.exists('site/public/changelog/café/cover.png')).toBe(true);
  });
});
