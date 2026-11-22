import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), children: [], version: '4.0.0' }));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('../../electron/executables.mjs', () => ({ findOnPath: () => 'uv' }));

beforeEach(() => {
  vi.resetModules();
  mocks.spawn.mockReset();
  mocks.children = [];
  mocks.version = '4.0.0';
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.write = vi.fn((line) =>
      queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ cases: JSON.parse(line) }) + '\n')),
    );
    child.stdin.end = vi.fn(() => queueMicrotask(() => child.emit('close', 0)));
    child.kill = vi.fn(() => queueMicrotask(() => child.emit('close', 1)));
    mocks.children.push(child);
    queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ ready: true, version: mocks.version }) + '\n'));

    return child;
  });
});

afterEach(async () => {
  const { closeNativeContactReplays } = await import('./nativeContactReplay.mjs');

  await closeNativeContactReplays();
});

describe('native contact runtime', () => {
  it('starts one pinned runtime and keeps concurrent replies with their own request', async () => {
    const { prepareNativeContactReplay, nativeContactReplay } = await import('./nativeContactReplay.mjs');

    await Promise.all([prepareNativeContactReplay('4.0.0'), prepareNativeContactReplay('4.0.0')]);

    const results = await Promise.all([
      nativeContactReplay({ name: 'first' }, '4.0.0'),
      nativeContactReplay({ name: 'second' }, '4.0.0'),
    ]);

    expect(results).toEqual([{ cases: [{ name: 'first' }] }, { cases: [{ name: 'second' }] }]);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls[0][1]).toContain('mujoco-core==4.0.0');
    expect(mocks.spawn.mock.calls[0][1]).toContain('--stream');
  });

  it('refuses a runtime with the wrong native MuJoCo version', async () => {
    const { prepareNativeContactReplay } = await import('./nativeContactReplay.mjs');

    mocks.version = '4.0.1';
    await expect(prepareNativeContactReplay('4.0.0')).rejects.toThrow('differs from 4.0.0');
    expect(mocks.children[0].kill).toHaveBeenCalledOnce();
  });

  it('rejects pending work on a process failure and waits for close during cleanup', async () => {
    const { prepareNativeContactReplay, nativeContactReplay, closeNativeContactReplays } =
      await import('./nativeContactReplay.mjs');

    await prepareNativeContactReplay('4.0.0');

    const child = mocks.children[0];

    child.stdin.write.mockImplementation(() => queueMicrotask(() => child.emit('close', 1)));
    await expect(nativeContactReplay({}, '4.0.0')).rejects.toThrow('Native MuJoCo closed (1)');
    await closeNativeContactReplays();
    expect(child.stdin.end).toHaveBeenCalledOnce();
  });

  it('rejects malformed replies without accepting a silent successful replay', async () => {
    const { prepareNativeContactReplay, nativeContactReplay } = await import('./nativeContactReplay.mjs');

    await prepareNativeContactReplay('4.0.0');
    mocks.children[0].stdin.write.mockImplementation(() =>
      queueMicrotask(() => mocks.children[0].stdout.emit('data', 'broken\n')),
    );
    await expect(nativeContactReplay({}, '4.0.0')).rejects.toThrow();
    expect(mocks.children[0].kill).toHaveBeenCalledOnce();
  });
});
