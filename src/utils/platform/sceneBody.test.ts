import { deepStrictEqual } from 'node:assert/strict';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { imageWorker } from '../imageEncode';
import { imageHandlers } from '../imageOps';
import { platformBridge } from '../platformBridge';
import { webRequest } from './web/webBackend';

const mode = vi.hoisted(() => ({ web: false }));

vi.mock('../imageEncode', async (original) => ({
  ...(await original<typeof import('../imageEncode')>()),
  imageWorker: { call: vi.fn() },
}));
vi.mock('./webDemo', async (original) => ({
  ...(await original<typeof import('./webDemo')>()),
  get IS_WEB_DEMO() {
    return mode.web;
  },
}));
vi.mock('./web/webBackend', async (original) => ({
  ...(await original<typeof import('./web/webBackend')>()),
  webRequest: vi.fn(),
}));

beforeEach(() => {
  mode.web = false;
  vi.mocked(imageWorker.call).mockReset();
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('sends owned worker-encoded JSON bytes through the existing scene route without changing Unicode or asset content', async () => {
  const json = JSON.stringify({
    id: 'robot',
    name: '机器人 🤖',
    text: '\ud800',
    parts: [],
    texture: 'AQID'.repeat(262144),
  });
  const blob = imageHandlers.jsonBody(json).result;

  vi.stubGlobal('window', {});

  vi.mocked(imageWorker.call).mockResolvedValue(blob);

  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'robot' }));
  const saved = await platformBridge.saveSceneJson(json);
  const [url, init] = fetch.mock.calls[0];

  expect(saved.id).toBe('robot');
  expect(imageWorker.call).toHaveBeenCalledExactlyOnceWith('jsonBody', json);
  expect(url).toBe('/api/bridge/save-scene');
  expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(init?.body).toBe(blob);
  expect(blob.type).toBe('application/json');
  expect(await blob.text()).toBe(json);
  deepStrictEqual(
    new Uint8Array(await new Request('https://example.com', init).arrayBuffer()),
    new TextEncoder().encode(json),
  );
});

it('preserves the native preload save and browser storage paths', async () => {
  const saveSceneJson = vi.fn().mockResolvedValue({ id: 'native' });

  vi.stubGlobal('window', { electronAPI: { saveSceneJson } });

  const fetch = vi.spyOn(globalThis, 'fetch');

  expect((await platformBridge.saveSceneJson('{"id":"native"}')).id).toBe('native');
  expect(saveSceneJson).toHaveBeenCalledExactlyOnceWith('{"id":"native"}');
  expect(imageWorker.call).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal('window', undefined);
  mode.web = true;
  vi.mocked(webRequest).mockResolvedValue(Response.json({ id: 'web' }));
  expect((await platformBridge.saveSceneJson('{"id":"web"}')).id).toBe('web');
  expect(webRequest).toHaveBeenCalledExactlyOnceWith('/save-scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"id":"web"}',
  });
  expect(imageWorker.call).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('refuses delivery if body preparation fails without issuing an empty or partial write', async () => {
  vi.stubGlobal('window', {});
  vi.mocked(imageWorker.call).mockRejectedValue(new Error('body preparation failed'));

  const fetch = vi.spyOn(globalThis, 'fetch');

  await expect(platformBridge.saveSceneJson('{"id":"robot"}')).rejects.toThrow('body preparation failed');
  expect(fetch).not.toHaveBeenCalled();
});

it('encodes inside an existing worker realm without dispatching a nested encoding worker', async () => {
  vi.stubGlobal('Worker', vi.fn());

  const json = '{"id":"worker","name":"机器人"}';
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'worker' }));

  await platformBridge.saveSceneJson(json);

  const body = fetch.mock.calls[0][1]?.body;

  expect(body).toBeInstanceOf(Blob);
  expect(await (body as Blob).text()).toBe(json);
  expect(imageWorker.call).not.toHaveBeenCalled();
});
