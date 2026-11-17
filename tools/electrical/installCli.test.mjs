import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const expectedHash = 'f75347945e092df7615d2a3d3acd41d868d13f3b9be031ed00ecdf1c79f9e96c';
const native = vi.hoisted(() => ({
  spawn: vi.fn(),
  append: vi.fn(),
  remove: vi.fn(),
  digest: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawnSync: native.spawn }));
vi.mock('node:crypto', () => ({ createHash: () => ({ update: vi.fn(), digest: native.digest }) }));
vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn(), appendFile: native.append, rm: native.remove },
}));
vi.mock('node:fs', () => ({
  default: { createWriteStream: () => new Writable({ write: (_chunk, _encoding, done) => done() }) },
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.defineProperty(process, 'platform', { value: 'win32' });
  vi.stubEnv('GITHUB_ENV', 'github-env');
  vi.stubEnv('GITHUB_PATH', 'github-path');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('installer bytes')));
  native.digest.mockReturnValue(expectedHash);
  native.spawn.mockReturnValue({ status: 0, stdout: '9.0.6\n', stderr: '' });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('installs for the current user and publishes only the verified CLI to subsequent CI steps', async () => {
  await import('./installCli.mjs');

  const folder = path.resolve('scratch', 'kicad-9.0.6');
  const installer = path.resolve('scratch', 'kicad-9.0.6-x86_64.exe');
  const executable = path.join(folder, 'bin', 'kicad-cli.exe');

  expect(native.spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
    [installer, ['/S', '/currentuser', `/D=${folder}`]],
    [executable, ['version']],
  ]);
  expect(native.append.mock.calls).toEqual([
    ['github-env', `BASECASE_KICAD_CLI=${executable}\n`],
    ['github-path', `${path.dirname(executable)}\n`],
  ]);
  expect(native.remove).toHaveBeenCalledWith(installer);
});

it('refuses a changed download before running it', async () => {
  native.digest.mockReturnValue('different');

  await expect(import('./installCli.mjs')).rejects.toThrow('KiCad installer checksum differs.');
  expect(native.spawn).not.toHaveBeenCalled();
  expect(native.append).not.toHaveBeenCalled();
});

it('reports silent installer exit status and stops before publishing the CLI', async () => {
  native.spawn.mockReturnValue({ status: 2, signal: null, stdout: '', stderr: '' });

  await expect(import('./installCli.mjs')).rejects.toThrow('exit 2, signal none');
  expect(native.spawn).toHaveBeenCalledTimes(1);
  expect(native.append).not.toHaveBeenCalled();
});

it('retains a native launch error instead of hiding it behind empty stderr', async () => {
  native.spawn.mockReturnValue({ status: null, error: new Error('spawn EACCES') });

  await expect(import('./installCli.mjs')).rejects.toThrow('spawn EACCES');
  expect(native.append).not.toHaveBeenCalled();
});

it('refuses to publish an installation with a different CLI version', async () => {
  native.spawn.mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 0, stdout: '9.0.5\n' });

  await expect(import('./installCli.mjs')).rejects.toThrow('KiCad version differs.');
  expect(native.append).not.toHaveBeenCalled();
});

it('selects the installed local KiCad container for Linux conversion and browser routing', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' });

  await import('./installCli.mjs');
  expect(native.spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
    ['docker', ['pull', 'kicad/kicad:9.0.6']],
  ]);
  expect(native.append).toHaveBeenCalledWith('github-env', 'BASECASE_KICAD_DOCKER=1\n');
});

it('installs KiCad for the Kit electrical browser shard without selecting the router', async () => {
  const argv = process.argv;

  process.argv = [...argv, '--browser-shard', '2/5'];
  native.spawn.mockReturnValueOnce({ status: 0, stdout: 'e2e/kitElectrical.e2e.test.ts\n' });

  try {
    await import('./installCli.mjs');

    expect(native.spawn.mock.calls[0][1]).toContain('--filesOnly');
    expect(native.spawn.mock.calls.at(-1)[1]).toEqual(['version']);
    expect(native.append).toHaveBeenCalledWith('github-env', expect.stringContaining('BASECASE_KICAD_CLI='));
  } finally {
    process.argv = argv;
  }
});
