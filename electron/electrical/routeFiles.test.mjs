import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { watchRouteFiles } from './routeFiles.mjs';

const native = vi.hoisted(() => ({ readdir: vi.fn(), lstat: vi.fn() }));

vi.mock('node:fs/promises', () => ({ default: native }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

const root = path.join('routing', 'job');
const missing = Object.assign(new Error('gone'), { code: 'ENOENT' });
const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
const stat = (kind, size = 0) => ({
  size,
  isFile: () => kind === 'file',
  isDirectory: () => kind === 'directory',
  isSymbolicLink: () => kind === 'symlink',
});

async function sample(directory = root) {
  vi.useFakeTimers();

  const stop = vi.fn();
  const close = watchRouteFiles(directory, stop);

  await vi.advanceTimersByTimeAsync(100);
  await close();

  const calls = native.readdir.mock.calls.length;

  await vi.advanceTimersByTimeAsync(1000);
  expect(native.readdir).toHaveBeenCalledTimes(calls);

  return stop;
}

it.each([0, 24 * 1024 * 1024, 24 * 1024 * 1024 + 1])(
  'continues bounding live files when a listed temporary file disappears with %s bytes remaining',
  async (size) => {
    native.readdir.mockResolvedValue(['temporary', 'candidate.kicad_pcb']);
    native.lstat.mockImplementation(async (file) => {
      if (file.endsWith('candidate.kicad_pcb')) return stat('file', size);

      throw missing;
    });

    const stop = await sample();

    expect(stop).toHaveBeenCalledTimes(size > 24 * 1024 * 1024 ? 1 : 0);

    if (size > 24 * 1024 * 1024) expect(stop.mock.calls[0][0].cause).toEqual({ resource: 'bytes', observed: size });
  },
);

it('tolerates a missing entry using the real asynchronous filesystem API', async () => {
  const { default: fs } = await vi.importActual('node:fs/promises');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'routing-watch-'));

  native.readdir.mockResolvedValue(['temporary']);
  native.lstat.mockImplementation(fs.lstat);

  try {
    const stop = await sample(directory);

    expect(stop).not.toHaveBeenCalled();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('tolerates a nested directory disappearing before enumeration and still inspects its siblings', async () => {
  native.readdir.mockImplementation(async (directory) => {
    if (directory === root) return ['settings', 'candidate.kicad_pcb'];

    throw missing;
  });
  native.lstat.mockImplementation(async (file) => stat(file.endsWith('settings') ? 'directory' : 'file', 1024));

  const stop = await sample();

  expect(stop).not.toHaveBeenCalled();
  expect(native.lstat).toHaveBeenCalledWith(path.join(root, 'candidate.kicad_pcb'));
  expect(native.readdir).toHaveBeenCalledWith(path.join(root, 'settings'));
});

it.each([missing, denied])('retains root enumeration failure %s', async (error) => {
  native.readdir.mockRejectedValue(error);

  const stop = await sample();

  expect(stop).toHaveBeenCalledExactlyOnceWith(error);
});

it('retains inspection failures other than a vanished entry', async () => {
  native.readdir.mockResolvedValue(['candidate.kicad_pcb']);
  native.lstat.mockRejectedValue(denied);

  const stop = await sample();

  expect(stop).toHaveBeenCalledExactlyOnceWith(denied);
});

it('refuses symbolic links before traversing their targets', async () => {
  native.readdir.mockResolvedValue(['outside']);
  native.lstat.mockResolvedValue(stat('symlink'));

  const stop = await sample();

  expect(stop.mock.calls[0][0].cause).toEqual({ resource: 'symlink', observed: 'outside' });
  expect(native.readdir).toHaveBeenCalledTimes(1);
});

it.each([63, 64])('bounds the total entries across nested directories containing %s files', async (count) => {
  native.readdir.mockImplementation(async (directory) =>
    directory === root ? ['settings'] : Array.from({ length: count }, (_, i) => `file-${i}`),
  );
  native.lstat.mockImplementation(async (file) => stat(file.endsWith('settings') ? 'directory' : 'file'));

  const stop = await sample();

  expect(stop).toHaveBeenCalledTimes(count === 64 ? 1 : 0);

  if (count === 64) expect(stop.mock.calls[0][0].cause).toEqual({ resource: 'entries', observed: 65 });
});
