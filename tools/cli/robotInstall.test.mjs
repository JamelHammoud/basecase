import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('./basecase.mjs', import.meta.url));
const temporary = [];
const map = {
  robot: 'Home arm',
  class: 'arm',
  joints: [{ id: 1, name: 'shoulder', zero_counts: 2048, direction: 1, min_rad: -1, max_rad: 1 }],
};

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function folder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-install-cli-'));

  temporary.push(dir);
  fs.writeFileSync(path.join(dir, 'joint_map.json'), JSON.stringify(map));

  return dir;
}

const run = (cwd, args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd }, (error, stdout, stderr) =>
      resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });

describe('basecase robot install', () => {
  it('reads the current folder’s package before validating the SSH target', async () => {
    const result = await run(folder(), ['robot', 'install', 'robot@host;touch-pwned']);

    expect(result).toEqual({ code: 2, stdout: '', stderr: 'Enter the SSH target as user@host.\n' });
  });

  it('reads --package and rejects a malformed code without making an SSH connection', async () => {
    const dir = folder();
    const result = await run(os.tmpdir(), [
      'robot',
      'install',
      'robot@host.local',
      '--package',
      dir,
      '--pairing-code',
      'wrong',
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('six-digit pairing code');
  });

  it('rejects missing packages and conflicting scene/package inputs with exit 2', async () => {
    const dir = folder();

    fs.rmSync(path.join(dir, 'joint_map.json'));

    expect((await run(dir, ['robot', 'install', 'robot@host.local'])).stderr).toContain('joint_map.json');
    expect(
      (await run(dir, ['robot', 'install', 'robot@host.local', '--scene', 'scene.basecase', '--package', dir])).stderr,
    ).toContain('Usage:');
  });
});
