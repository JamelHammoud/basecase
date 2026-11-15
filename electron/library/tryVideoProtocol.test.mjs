import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ protocol: { handle: vi.fn() }, net: { fetch: vi.fn() } }));

vi.mock('electron', () => electron);

const { serveApp } = await import('../appProtocol.mjs');

let dir;

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('recorded camera video in the packaged app', () => {
  it('serves ranged bytes through app://basecase with isolation headers', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'try-video-protocol-'));

    const file = path.join(dir, 'clip.mp4');
    const videoFile = vi.fn(() => ({ file, size: 4 }));

    fs.writeFileSync(file, new Uint8Array([1, 2, 3, 4]));
    serveApp({ distDir: dir, tries: { videoFile } });

    const handler = electron.protocol.handle.mock.calls[0][1];
    const response = await handler(new Request('app://basecase/api/tries/video/try-1/front', { headers: { Range: 'bytes=1-2' } }));

    expect(response.status).toBe(206);
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3]);
    expect(videoFile).toHaveBeenCalledWith({ id: 'try-1', camera: 'front' });
    expect(electron.net.fetch).not.toHaveBeenCalled();

    const refused = await handler(new Request('app://other/api/tries/video/try-1/front'));

    expect(refused.status).toBe(404);
    expect(videoFile).toHaveBeenCalledTimes(1);
  });

  it('serves cached model bytes through the same app protocol', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-protocol-'));

    const hash = 'a'.repeat(64);

    fs.mkdirSync(path.join(dir, 'models'));
    fs.writeFileSync(path.join(dir, 'models', `${hash}.onnx`), new Uint8Array([5, 6, 7]));
    serveApp({ distDir: dir, libraryDir: dir });

    const handler = electron.protocol.handle.mock.calls[0][1];
    const response = await handler(new Request(`app://basecase/api/vision-model/${hash}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([5, 6, 7]);
    expect(electron.net.fetch).not.toHaveBeenCalled();
  });

});
