import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadTryVideos } from './videoUploadJobs';
import { saveTryVideos, videoTransfers } from './videoUploadClient';

const sha = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

afterEach(() => vi.unstubAllGlobals());

describe('worker camera uploads', () => {
  it('transfers shared bytes once and uploads one body before binding other tries', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const videos = ['try-1', 'try-2'].map((id) => ({ id, camera: 'front', bytes }));
    const send = vi.fn<typeof fetch>(async () => new Response(null));

    expect(videoTransfers(videos)).toEqual([bytes.buffer]);
    await uploadTryVideos({ videos, web: false, baseUrl: 'app://basecase/' }, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe(`app://basecase/api/tries/video/try-1/front?asset=${sha}`);
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: bytes, headers: { 'X-Video-Bytes': '4' } });
    expect(send.mock.calls[1][1]).toEqual({ method: 'POST' });
    expect(bytes.byteLength).toBe(4);
  });

  it('refuses failed uploads and does not bind another try to incomplete data', async () => {
    const bytes = new Uint8Array([1]);
    const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 413 }));

    await expect(
      uploadTryVideos(
        {
          videos: [
            { id: 'one', camera: 'front', bytes },
            { id: 'two', camera: 'front', bytes },
          ],
          web: false,
          baseUrl: 'http://localhost/',
        },
        send,
      ),
    ).rejects.toThrow('Import');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('hands the whole batch to one worker without detaching a shared source before later episodes are sent', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response(null));
    const received: number[][] = [];

    vi.stubGlobal('location', { href: 'app://basecase/' });
    vi.stubGlobal(
      'Worker',
      class {
        onmessage?: (event: MessageEvent) => void;
        onerror?: (event: ErrorEvent) => void;
        terminate() {}
        postMessage(
          request: { id: number; payload: import('./videoUploadTypes').VideoUploadBatch },
          transfer: Transferable[],
        ) {
          const cloned = structuredClone(request, { transfer });

          received.push(
            cloned.payload.videos.map((video: import('./videoUploadTypes').TryVideoUpload) => video.bytes.byteLength),
          );
          void uploadTryVideos(cloned.payload, send).then(() =>
            this.onmessage?.({ data: { id: cloned.id, result: null } } as MessageEvent),
          );
        }
      },
    );

    const bytes = new Uint8Array([1, 2, 3, 4]);

    await saveTryVideos(['try-1', 'try-2'].map((id) => ({ id, camera: 'front', bytes })));
    expect(received).toEqual([[4, 4]]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'POST']);
  });
});
