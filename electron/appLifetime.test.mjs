import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { registerWindowLifetime } from './appLifetime.mjs';
import { KernelPool } from './cad-kernel/sandbox/pool.mjs';

afterEach(() => vi.useRealTimers());

it.each(['win32', 'linux', 'darwin'])('keeps self-tests alive across kernel retirement on %s', async (platform) => {
  vi.useFakeTimers();

  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const disconnect = vi.fn();
  const windows = new Set();
  let used = 0;
  const pool = new KernelPool({
    size: 1,
    memoryLimitBytes: 1000,
    memoryOf: () => used,
    pollMs: 5,
    openSlot: (handlers) => {
      const window = { handlers, run: vi.fn(), pid: () => 100 };

      windows.add(window);

      return {
        ...window,
        kill: () => {
          windows.delete(window);

          if (!windows.size) app.emit('window-all-closed');
        },
      };
    },
  });

  registerWindowLifetime(app, { disconnect, selfTesting: true, platform });

  try {
    for (const kind of ['hang', 'memory']) {
      const stopped = pool.submit({ convert: true, kind }, 10);
      const window = [...windows][0];

      used = kind === 'memory' ? 2000 : 0;
      window.handlers.onReady();
      await vi.advanceTimersByTimeAsync(kind === 'memory' ? 5 : 10);
      expect(JSON.parse(Buffer.from(await stopped).toString()).ok).toBe(false);
      expect(windows.size).toBe(0);
      expect(app.quit).not.toHaveBeenCalled();

      used = 0;

      const next = pool.submit({ convert: true }, 10);
      const fresh = [...windows][0];

      fresh.handlers.onReady();
      fresh.handlers.onResult(fresh.run.mock.calls[0][0].id, Buffer.from('{"ok":true}'));
      expect(JSON.parse(Buffer.from(await next).toString())).toEqual({ ok: true });
      pool.stop();
    }

    expect(app.quit).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  } finally {
    pool.stop();
  }
});

it.each(['win32', 'linux', 'darwin'])('retains ordinary last-window behavior on %s', (platform) => {
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const disconnect = vi.fn();

  registerWindowLifetime(app, { disconnect, selfTesting: false, platform });
  app.emit('window-all-closed');

  expect(disconnect).toHaveBeenCalledOnce();
  expect(app.quit).toHaveBeenCalledTimes(platform === 'darwin' ? 0 : 1);
});
