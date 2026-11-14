import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDaemon, stagedDaemon } from './beforePack.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projects = [];

function project({ staged = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-pack-'));

  projects.push(dir);

  if (staged) {
    fs.mkdirSync(path.join(dir, 'hw', 'dist'), { recursive: true });
    fs.writeFileSync(stagedDaemon(dir, 'darwin'), '');
  }

  return dir;
}

function recorder(dir, { builds = true } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([path.basename(cmd), ...args.map((a) => (a.startsWith(dir) ? path.relative(dir, a) : a))]);

    if (!builds || !args.some((a) => a.endsWith('stage.mjs'))) return;

    fs.mkdirSync(path.join(dir, 'hw', 'dist'), { recursive: true });
    fs.writeFileSync(stagedDaemon(dir, 'darwin'), '');
  };

  return { calls, run };
}

afterEach(() => {
  for (const dir of projects.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('packaging stages the robot daemon', () => {
  it('runs before every electron-builder pack, so electron-builder --dir ships the daemon too', () => {
    const build = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).build;

    expect(build.beforePack).toBe('tools/release/beforePack.mjs');
    expect(build.mac.extraResources).toContainEqual({ from: 'hw/dist', to: 'hw' });
    expect(build.win.extraResources).toContainEqual({ from: 'hw/dist', to: 'hw' });
  });

  it('builds and stages the daemon when hw/dist has none', () => {
    const dir = project();
    const { calls, run } = recorder(dir);

    expect(ensureDaemon({ projectDir: dir, platform: 'darwin', host: 'darwin', run })).toBe(stagedDaemon(dir, 'darwin'));
    expect(calls).toEqual([
      ['cargo', 'build', '--release', '--manifest-path', path.join('hw', 'Cargo.toml'), '-p', 'robot-daemon'],
      [path.basename(process.execPath), path.join('tools', 'hw', 'stage.mjs')],
    ]);
  });

  it('keeps a daemon already staged', () => {
    const dir = project({ staged: true });
    const { calls, run } = recorder(dir);

    ensureDaemon({ projectDir: dir, platform: 'darwin', host: 'darwin', run });

    expect(calls).toEqual([]);
  });

  it('fails the package rather than ship an app without its daemon', () => {
    const dir = project();
    const failing = () => {
      throw new Error('spawnSync cargo ENOENT');
    };

    expect(() => ensureDaemon({ projectDir: dir, platform: 'darwin', host: 'darwin', run: failing })).toThrow(
      /robot daemon didn't build/,
    );
    expect(() =>
      ensureDaemon({ projectDir: dir, platform: 'darwin', host: 'darwin', run: recorder(dir, { builds: false }).run }),
    ).toThrow(/left no hw\/dist\/robot-daemon/);
    expect(() => ensureDaemon({ projectDir: dir, platform: 'win32', host: 'darwin', run: failing })).toThrow(
      /no robot daemon for win32/,
    );
  });
});
