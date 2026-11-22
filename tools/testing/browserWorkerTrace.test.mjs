import { afterEach, expect, it, vi } from 'vitest';
import { installBrowserWorkerTrace } from './browserWorkerTrace';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('leaves default browser behavior unchanged', async () => {
  vi.stubEnv('BASECASE_DIAGNOSTIC_BROWSER_TRACE', '0');

  const page = { on: vi.fn(), addInitScript: vi.fn() };

  await installBrowserWorkerTrace(page);
  expect(page.on).not.toHaveBeenCalled();
  expect(page.addInitScript).not.toHaveBeenCalled();
});

it('retains bounded worker errors while preserving the native constructor and omitting payloads and URL queries', async () => {
  vi.stubEnv('BASECASE_DIAGNOSTIC_BROWSER_TRACE', '1');

  class Native extends EventTarget {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
    }
  }

  vi.stubGlobal('window', { Worker: Native });
  vi.stubGlobal('location', { href: 'https://example.test/' });

  const printed = vi.spyOn(console, 'debug').mockImplementation(() => {});

  await installBrowserWorkerTrace({ on: vi.fn(), addInitScript: async (read) => read() });

  const worker = new window.Worker('/thumbnail.worker.js?token=hidden', { type: 'module' });

  for (let i = 0; i < 25; i++)
    worker.dispatchEvent(
      new MessageEvent('message', { data: { id: i, error: 'fixture failure', payload: 'private-payload' } }),
    );

  expect(worker).toBeInstanceOf(Native);
  expect(worker.options).toEqual({ type: 'module' });
  expect(printed).toHaveBeenCalledTimes(20);
  expect(JSON.parse(printed.mock.calls[0][1])).toEqual({
    path: '/thumbnail.worker.js',
    kind: 'reply',
    error: 'fixture failure',
    id: 0,
  });
  expect(JSON.stringify(printed.mock.calls)).not.toContain('private-payload');
  expect(JSON.stringify(printed.mock.calls)).not.toContain('hidden');
});
