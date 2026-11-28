import { afterEach, expect, it, vi } from 'vitest';
import { openInferenceWorker } from './inferenceWorkerFixture';

const fixture = vi.hoisted(() => ({
  launch: vi.fn(),
  build: vi.fn(),
}));

vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext: fixture.launch } }));
vi.mock('vite', () => ({ build: fixture.build }));

afterEach(() => vi.resetAllMocks());

function bundle() {
  fixture.build.mockResolvedValue({
    output: [
      { type: 'chunk', fileName: 'worker.js', code: 'worker' },
      { type: 'asset', fileName: 'runtime.wasm', source: new Uint8Array([1, 2]) },
    ],
  });
}

function url() {
  const options = fixture.launch.mock.calls[0][1] as { args: string[] };

  return options.args.find((argument) => argument.startsWith('--app='))!.slice(6);
}

it('serves production worker assets and closes the owned browser and server', async () => {
  bundle();

  const page = {};
  const close = vi.fn().mockResolvedValue(undefined);

  fixture.launch.mockResolvedValue({ pages: () => [page], close });

  const app = await openInferenceWorker(new AbortController().signal);
  const origin = url();

  expect(app.page).toBe(page);
  expect(await (await fetch(new URL('worker.js', origin))).text()).toBe('worker');
  expect((await fetch(origin)).headers.get('cross-origin-embedder-policy')).toBe('credentialless');
  expect((await fetch(new URL('runtime.wasm', origin))).headers.get('content-type')).toBe('application/wasm');
  await app.close();
  await app.close();
  expect(close).toHaveBeenCalledTimes(1);
  await expect(fetch(origin)).rejects.toThrow();
});

it('closes a browser that arrives after setup cancellation', async () => {
  bundle();

  const setup = new AbortController();
  const close = vi.fn().mockResolvedValue(undefined);

  fixture.launch.mockImplementation(async () => {
    setup.abort();

    return { pages: () => [{}], close };
  });
  await expect(openInferenceWorker(setup.signal)).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(1);
  await expect(fetch(url())).rejects.toThrow();
});

it('closes its server when Chrome launch fails', async () => {
  bundle();
  fixture.launch.mockRejectedValue(new Error('Chrome unavailable'));
  await expect(openInferenceWorker(new AbortController().signal)).rejects.toThrow('Chrome unavailable');
  await expect(fetch(url())).rejects.toThrow();
});

it('releases both resources when Chrome has no initial page', async () => {
  bundle();

  const close = vi.fn().mockResolvedValue(undefined);

  fixture.launch.mockResolvedValue({ pages: () => [], close });
  await expect(openInferenceWorker(new AbortController().signal)).rejects.toThrow('Expected the inference test page.');
  expect(close).toHaveBeenCalledTimes(1);
  await expect(fetch(url())).rejects.toThrow();
});

it('preserves setup failure and closes the server when browser cleanup rejects', async () => {
  bundle();

  const close = vi.fn().mockRejectedValue(new Error('Chrome cleanup failed'));

  fixture.launch.mockResolvedValue({ pages: () => [], close });
  await expect(openInferenceWorker(new AbortController().signal)).rejects.toThrow('Expected the inference test page.');
  expect(close).toHaveBeenCalledTimes(1);
  await expect(fetch(url())).rejects.toThrow();
});
