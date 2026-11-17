import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installBoardRouter } from './installRouter.mjs';

const native = vi.hoisted(() => ({ spawn: vi.fn(), find: vi.fn(), digest: vi.fn(), verify: vi.fn() }));

vi.mock('node:child_process', () => ({ spawnSync: native.spawn }));
vi.mock('node:crypto', () => ({ createHash: () => ({ update: vi.fn(), digest: native.digest }) }));
vi.mock('../../electron/executables.mjs', () => ({ findOnPath: native.find }));
vi.mock('../../electron/electrical/routeTools.mjs', () => ({
  ROUTER_VERSION: '2.1.0',
  ROUTER_HASH: 'router-hash',
  verifyRoutingRuntime: native.verify,
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const arch = Object.getOwnPropertyDescriptor(process, 'arch');
let root;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(process, 'platform', { value: 'win32' });
  Object.defineProperty(process, 'arch', { value: 'x64' });
  vi.stubEnv('SystemRoot', path.join('Windows root'));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response('pinned bytes'))),
  );
  native.digest
    .mockReturnValueOnce('2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628')
    .mockReturnValueOnce('router-hash');
  native.find.mockReturnValue(path.join('Windows root', 'System32', 'tar.exe'));
  native.spawn.mockImplementation((_command, args) => {
    const home = process.platform === 'darwin' ? ['Contents', 'Home'] : [];

    mkdirSync(path.join(args[3], 'jdk-21.0.13+9-jre', ...home, 'bin'), { recursive: true });

    return { status: 0 };
  });
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'board-router-test-'));
});

it.each([
  ['linux', 'a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd'],
  ['darwin', 'c909674b1c10c261b9a3fb7e9c0efebd303e33f88a4fe84be7135b5e2d711f89'],
])('retains PATH tar and the verified runtime layout on %s', async (host, digest) => {
  Object.defineProperty(process, 'platform', { value: host });
  native.digest.mockReset().mockReturnValueOnce(digest).mockReturnValueOnce('router-hash');
  native.find.mockReturnValue('tar');

  await installBoardRouter(path.join(root, 'tools'));
  expect(native.find.mock.calls[0][0]).toBe('tar');
  expect(native.find.mock.calls[0][1] ?? process.env.PATH).toBe(process.env.PATH);
  expect(native.spawn.mock.calls[0][1][1]).toMatch(/runtime\.tar\.gz$/);
  expect(native.verify).toHaveBeenCalledWith(
    { java: expect.stringContaining(path.join('runtime', 'bin', 'java')) },
    { cwd: expect.any(String) },
  );
  expect(await fs.readdir(root)).toEqual(['tools']);
});

afterEach(async () => {
  Object.defineProperty(process, 'platform', platform);
  Object.defineProperty(process, 'arch', arch);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

it('installs the pinned Windows runtime with system tar instead of a Git PATH override', async () => {
  vi.stubEnv('PATH', path.join('Git', 'usr', 'bin'));

  const target = path.join(root, 'routing tools');

  await expect(installBoardRouter(target)).resolves.toBe(target);
  expect(native.find).toHaveBeenCalledWith('tar', path.join('Windows root', 'System32'));
  expect(native.spawn).toHaveBeenCalledWith(
    path.join('Windows root', 'System32', 'tar.exe'),
    ['-xf', expect.stringContaining('runtime.zip'), '-C', expect.any(String)],
    expect.objectContaining({ windowsHide: true, timeout: 30_000 }),
  );
  expect(native.verify).toHaveBeenCalledWith(
    { java: expect.stringContaining(path.join('runtime', 'bin', 'java.exe')) },
    { cwd: expect.any(String) },
  );
  expect(await fs.readdir(root)).toEqual(['routing tools']);
});

it('retains extraction diagnostics and removes staging without publishing an installation', async () => {
  native.spawn.mockReturnValue({ status: 1, stderr: Buffer.from('unsupported archive') });

  await expect(installBoardRouter(path.join(root, 'tools'))).rejects.toThrow('unsupported archive');
  expect(native.verify).not.toHaveBeenCalled();
  expect(await fs.readdir(root)).toEqual([]);
});

it('refuses changed runtime bytes before extraction and cleans its staging directory', async () => {
  native.digest.mockReset().mockReturnValue('wrong hash');

  await expect(installBoardRouter(path.join(root, 'tools'))).rejects.toThrow('board-router');
  expect(native.spawn).not.toHaveBeenCalled();
  expect(native.verify).not.toHaveBeenCalled();
  expect(await fs.readdir(root)).toEqual([]);
});
