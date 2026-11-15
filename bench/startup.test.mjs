import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStudio } from './harness.mjs';

const f = vi.hoisted(() => ({ children: [], preflight: true, page: null, browser: null }));

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_exe, args) => {
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => {
      child.signalCode = 'SIGTERM';
      child.emit('exit');
      child.emit('close');
    });
    f.children.push(child);
    queueMicrotask(() => {
      if (!args.includes('--input-type=module')) return child.stdout.emit('data', 'ready in');

      if (!f.preflight) return;

      child.stdout.emit('data', '[true,true,""]');
      child.exitCode = 0;
      child.emit('exit');
      child.emit('close');
    });

    return child;
  }),
}));
vi.mock('playwright-core', () => ({ chromium: { launch: async () => f.browser } }));
vi.mock('node:http', () => ({ default: { get: () => ({ setTimeout: vi.fn(), on: vi.fn(), destroy: vi.fn() }) } }));

beforeEach(() => {
  f.children = [];
  f.preflight = true;
  f.page = { on: vi.fn(), goto: vi.fn(), evaluate: vi.fn().mockResolvedValue(true) };
  f.browser = { newPage: async () => f.page, close: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => vi.unstubAllGlobals());

describe('comparison app resources', () => {
  it('cancels a hung preflight before launching Vite or Chrome', async () => {
    f.preflight = false;

    const controller = new AbortController();
    const work = openStudio({ givenApp: process.cwd(), signal: controller.signal });
    const check = expect(work).rejects.toThrow('preflight');

    controller.abort();
    await check;
    expect(f.children).toHaveLength(1);
    expect(f.children[0].kill).toHaveBeenCalledOnce();
  });

  it('closes the browser and the running Vite process on deadline and repeated cleanup', async () => {
    const controller = new AbortController();
    const studio = await openStudio({ givenApp: process.cwd(), signal: controller.signal, agent: false, log: vi.fn() });

    controller.abort();
    await studio.close();
    expect(f.children).toHaveLength(2);
    expect(f.children[1].kill).toHaveBeenCalledOnce();
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
});
