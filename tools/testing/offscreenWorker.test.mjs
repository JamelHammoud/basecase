import { afterEach, expect, it, vi } from 'vitest';
import { openOffscreenWorker } from './offscreenWorker.ts';

const state = vi.hoisted(() => ({ launch: vi.fn(), servers: [] }));

vi.mock('vite', async (original) => ({
  ...(await original()),
  build: async () => ({ output: [{ type: 'chunk', code: '' }] }),
}));
vi.mock('playwright-core', () => ({ chromium: { launch: state.launch } }));
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

it('closes the server when browser cleanup fails after a page error', async () => {
  const close = vi.fn().mockRejectedValue(new Error('Browser stopped'));

  state.launch.mockResolvedValue({ newPage: async () => Promise.reject(new Error('Page failed')), close });

  await expect(openOffscreenWorker('fixture.ts', 'capture')).rejects.toThrow('Browser stopped');
  expect(close).toHaveBeenCalledOnce();
  expect(state.servers[0].listening).toBe(false);
});
