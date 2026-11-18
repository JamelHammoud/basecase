import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runQuarantineProcess } from './quarantineProcess.mjs';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFileSync: vi.fn(), windows: false }));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFileSync: mocks.execFileSync }));
vi.mock('../electron/executables.mjs', () => ({
  get IS_WINDOWS() {
    return mocks.windows;
  },
  findOnPath: (name) => `${name}.exe`,
}));

function childProcess() {
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null, kill: vi.fn() });

  mocks.spawn.mockReturnValue(child);
  mocks.execFileSync.mockReturnValue('123 1\n124 123\n125 124\n900 1\n');

  return child;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.windows = false;
});

describe('quarantine observation ownership', () => {
  it('keeps a failed observation diagnostic and cancels its deadline after normal closure', async () => {
    vi.useFakeTimers();

    const child = childProcess();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const result = runQuarantineProcess(['fixture.mjs'], { cwd: '.', timeoutMs: 45000 });

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ['fixture.mjs'],
      expect.objectContaining({ detached: true, env: expect.objectContaining({ BASECASE_QUARANTINE: 'only' }) }),
    );
    child.exitCode = 1;
    child.emit('close', 1);
    await expect(result).resolves.toEqual({ timedOut: false, code: 1 });
    await vi.advanceTimersByTimeAsync(45000);
    expect(kill).not.toHaveBeenCalled();
  });

  it.each([false, true])('ends the whole owned process tree at the budget on Windows=%s', async (windows) => {
    vi.useFakeTimers();
    mocks.windows = windows;

    const child = childProcess();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const result = runQuarantineProcess(['fixture.mjs'], { cwd: '.', timeoutMs: 45000 });

    await vi.advanceTimersByTimeAsync(44999);
    expect(kill).not.toHaveBeenCalled();
    expect(mocks.execFileSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    if (windows) {
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'taskkill.exe',
        ['/pid', '123', '/t', '/f'],
        expect.objectContaining({ timeout: 5000 }),
      );
      expect(kill).not.toHaveBeenCalled();
    } else {
      expect(kill.mock.calls).toEqual([
        [125, 'SIGKILL'],
        [124, 'SIGKILL'],
        [-123, 'SIGKILL'],
      ]);
      expect(kill).toHaveBeenCalledWith(-123, 'SIGKILL');
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'ps.exe',
        ['-axo', 'pid=,ppid='],
        expect.objectContaining({ timeout: 1000 }),
      );
    }

    child.emit('close', null);
    await expect(result).resolves.toEqual({ timedOut: true, code: null });
  });

  it('does not start another configuration after the shared budget expires', async () => {
    await expect(runQuarantineProcess([], { cwd: '.', timeoutMs: 0 })).resolves.toEqual({ timedOut: true });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('reports a failed launch and removes its deadline', async () => {
    vi.useFakeTimers();

    const child = childProcess();
    const result = runQuarantineProcess(['fixture.mjs'], { cwd: '.', timeoutMs: 45000 });

    child.emit('error', new Error('Cannot start'));
    await expect(result).resolves.toEqual({ timedOut: false, error: 'Cannot start' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
