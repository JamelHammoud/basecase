import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installBoardRouter } from './installRouter.mjs';

const native = vi.hoisted(() => ({
  find: vi.fn(),
  spawn: vi.fn(),
  verify: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  digest: vi.fn(),
}));

vi.mock('../../electron/executables.mjs', () => ({ IS_WINDOWS: true, findOnPath: native.find }));
vi.mock('node:child_process', () => ({ spawnSync: native.spawn }));
vi.mock('node:crypto', () => ({ createHash: () => ({ update: vi.fn(), digest: native.digest }) }));
vi.mock('../../electron/electrical/routeTools.mjs', () => ({
  ROUTER_VERSION: '2.1.0',
  ROUTER_HASH: 'jar-hash',
  verifyRoutingRuntime: native.verify,
}));
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    mkdtemp: vi.fn(async (prefix) => `${prefix}fixture`),
    open: vi.fn(async () => ({ writeFile: vi.fn(), close: vi.fn() })),
    rename: native.rename,
    rm: native.remove,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'x64' });
  vi.stubEnv('SystemRoot', 'windows-root');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('verified bytes')),
  );
  native.digest.mockReturnValueOnce('2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628');
  native.digest.mockReturnValueOnce('jar-hash');
  native.find.mockReturnValue(path.join('windows-root', 'System32', 'tar.exe'));
  native.spawn.mockReturnValue({ status: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  native.digest.mockReset();
});

it('extracts the pinned Windows ZIP with system tar and verifies Java before publishing the installation', async () => {
  const target = path.resolve('scratch', 'routing-tools');

  await expect(installBoardRouter(target)).resolves.toBe(target);
  expect(native.find).toHaveBeenCalledWith('tar', path.join('windows-root', 'System32'));
  expect(native.spawn).toHaveBeenCalledWith(
    path.join('windows-root', 'System32', 'tar.exe'),
    ['-xf', expect.stringMatching(/runtime\.zip$/u), '-C', expect.any(String)],
    expect.objectContaining({ windowsHide: true, timeout: 30000 }),
  );
  expect(native.verify).toHaveBeenCalledWith(
    { java: expect.stringContaining(path.join('runtime', 'bin', 'java.exe')) },
    { cwd: expect.any(String) },
  );
  expect(native.rename.mock.calls.at(-1)[1]).toBe(target);
  expect(native.remove).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
});

it('retains extraction diagnostics and removes staging without publishing a failed runtime', async () => {
  native.spawn.mockReturnValue({ status: 2, stderr: Buffer.from('archive extraction failed') });

  await expect(installBoardRouter('scratch/routing-tools')).rejects.toThrow('archive extraction failed');
  expect(native.verify).not.toHaveBeenCalled();
  expect(native.rename).not.toHaveBeenCalled();
  expect(native.remove).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
});
