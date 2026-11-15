import { afterEach, expect, it, vi } from 'vitest';
import { openOffscreenWorker } from './offscreenWorker.ts';

const state = vi.hoisted(() => ({ launch: vi.fn(), servers: [] }));

vi.mock('vite', async (original) => ({
  ...(await original()),
  build: async () => ({ output: [{ type: 'chunk', code: '' }] }),
}));
vi.mock('playwright-core', () => ({
  chromium: { launch: state.launch, launchPersistentContext: state.launch },
}));
vi.mock('node:http', async (original) => {
  const http = await original();

  return {
    ...http,
    createServer: (...args) => {
      const server = http.createServer(...args);

      state.servers.push(server);

      return server;
    },
  };
});

afterEach(() => {
  state.servers.forEach((server) => server.close());
  state.servers.length = 0;
  state.launch.mockReset();
});

it('closes the listening server when Chrome cannot launch', async () => {
  state.launch.mockRejectedValue(new Error('Chrome unavailable'));

  await expect(openOffscreenWorker('fixture.ts', 'capture')).rejects.toThrow('Chrome unavailable');
  expect(state.servers).toHaveLength(1);
  expect(state.servers[0].listening).toBe(false);
});

it('deducts time already spent in setup from the Chrome launch budget', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(700);

  state.launch.mockRejectedValue(new Error('Chrome unavailable'));

  try {
    await expect(openOffscreenWorker('fixture.ts', 'capture', { timeout: 15000 })).rejects.toThrow(
      'Chrome unavailable',
    );
    expect(state.launch).toHaveBeenCalledWith('', expect.objectContaining({ timeout: 14400 }));
  } finally {
    clock.mockRestore();
  }
});

it('closes the server when browser cleanup fails after a page error', async () => {
  const close = vi.fn().mockRejectedValue(new Error('Browser stopped'));

  const page = { evaluate: async () => Promise.reject(new Error('Page failed')) };

  state.launch.mockResolvedValue({ newPage: async () => page, pages: () => [page], close });

  await expect(openOffscreenWorker('fixture.ts', 'capture')).rejects.toThrow('Browser stopped');
  expect(close).toHaveBeenCalledOnce();
  expect(state.servers[0].listening).toBe(false);
});

it('uses the initial Chrome page and waits for worker initialization before returning ownership', async () => {
  const initialized = Promise.withResolvers();
  const page = { goto: vi.fn(), evaluate: vi.fn().mockReturnValue(initialized.promise) };
  const close = vi.fn();
  const newPage = vi.fn().mockRejectedValue(new Error('Extra page created'));

  state.launch.mockResolvedValue({ newPage, pages: () => [page], close });

  const opening = openOffscreenWorker('fixture.ts', 'capture');
  const returned = vi.fn();

  opening.then(returned).catch(() => undefined);
  await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalledOnce());
  expect(returned).not.toHaveBeenCalled();
  initialized.resolve();

  const worker = await opening;

  expect(newPage).not.toHaveBeenCalled();
  expect(page.goto).not.toHaveBeenCalled();
  expect(state.launch).toHaveBeenCalledWith(
    '',
    expect.objectContaining({
      ignoreDefaultArgs: ['about:blank'],
      timeout: expect.any(Number),
      args: expect.arrayContaining([`--app=http://127.0.0.1:${state.servers[0].address().port}/`]),
    }),
  );
  await worker.close();
  expect(close).toHaveBeenCalledOnce();
  expect(state.servers[0].listening).toBe(false);
});

it('closes Chrome and the server when setup is cancelled during worker initialization', async () => {
  const initialized = Promise.withResolvers();
  const controller = new AbortController();
  const error = new Error('Setup cancelled');
  const page = { evaluate: vi.fn().mockReturnValue(initialized.promise) };
  const close = vi.fn(async () => initialized.reject(error));

  state.launch.mockResolvedValue({ pages: () => [page], close });

  const opening = openOffscreenWorker('fixture.ts', 'capture', { signal: controller.signal });

  await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalledOnce());
  controller.abort(error);
  await expect(opening).rejects.toThrow('Setup cancelled');
  expect(close).toHaveBeenCalledOnce();
  expect(state.servers[0].listening).toBe(false);
});

it('does not acquire resources for setup that was already cancelled', async () => {
  const controller = new AbortController();

  controller.abort(new Error('Setup cancelled'));
  await expect(openOffscreenWorker('fixture.ts', 'capture', { signal: controller.signal })).rejects.toThrow(
    'Setup cancelled',
  );
  expect(state.launch).not.toHaveBeenCalled();
  expect(state.servers).toHaveLength(0);
});

it('rejects cancellation that arrives as worker initialization finishes', async () => {
  const initialized = Promise.withResolvers();
  const controller = new AbortController();
  const page = { evaluate: vi.fn().mockReturnValue(initialized.promise) };
  const close = vi.fn();

  state.launch.mockResolvedValue({ pages: () => [page], close });

  const opening = openOffscreenWorker('fixture.ts', 'capture', { signal: controller.signal });

  await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalledOnce());
  initialized.resolve();
  controller.abort(new Error('Setup cancelled'));
  await expect(opening).rejects.toThrow('Setup cancelled');
  expect(close).toHaveBeenCalledOnce();
  expect(state.servers[0].listening).toBe(false);
});

it('closes Chrome if launch completes after setup cancellation', async () => {
  const launch = Promise.withResolvers();
  const controller = new AbortController();
  const close = vi.fn();
  const pages = vi.fn();

  state.launch.mockReturnValue(launch.promise);

  const opening = openOffscreenWorker('fixture.ts', 'capture', { signal: controller.signal });

  await vi.waitFor(() => expect(state.launch).toHaveBeenCalledOnce());
  controller.abort(new Error('Setup cancelled'));
  launch.resolve({ close, pages });
  await expect(opening).rejects.toThrow('Setup cancelled');
  expect(close).toHaveBeenCalledOnce();
  expect(pages).not.toHaveBeenCalled();
  expect(state.servers[0].listening).toBe(false);
});

it('closes the server when setup is cancelled before Chrome returns', async () => {
  const launch = Promise.withResolvers();
  const controller = new AbortController();

  state.launch.mockReturnValue(launch.promise);

  const opening = openOffscreenWorker('fixture.ts', 'capture', { signal: controller.signal });

  await vi.waitFor(() => expect(state.launch).toHaveBeenCalledOnce());
  controller.abort(new Error('Setup cancelled'));

  try {
    expect(state.servers[0].listening).toBe(false);
  } finally {
    launch.reject(controller.signal.reason);
    await opening.catch(() => undefined);
  }
});
