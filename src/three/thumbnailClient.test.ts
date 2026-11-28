import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';

const fixture = vi.hoisted(() => ({ meshes: vi.fn(), local: vi.fn(), reply: vi.fn() }));

vi.mock('./componentMeshes', () => ({ renderMeshFiles: fixture.meshes }));
vi.mock('./thumbnailRender', () => ({ renderThumbnailJob: fixture.local }));

class ThumbnailWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((message: { id: number }) => {
    const response = fixture.reply(message);

    if (response) queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ...response } }));
  });
}

class ImageReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  async readAsDataURL(blob: Blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onload?.();
  }
}

const job = { parts: [box('carrier', [0, 10, 0], [40, 20, 30], 50)], tightness: 1 };
let worker: ThumbnailWorker;
let spawn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  worker = new ThumbnailWorker();
  spawn = vi.fn(function () {
    return worker;
  });
  vi.stubGlobal('Worker', spawn);
  vi.stubGlobal('FileReader', ImageReader);
  fixture.meshes.mockResolvedValue({});
  fixture.reply.mockReturnValue({ result: new Blob(['thumbnail'], { type: 'image/webp' }) });
  fixture.local.mockRejectedValue(new Error('Main-thread thumbnail rendering reached'));
});

afterEach(() => vi.unstubAllGlobals());

it('delivers worker images and keeps the worker usable after one render fails', async () => {
  const { renderThumbnailImage } = await import('./thumbnailClient');
  const failure = new Error('The selected mesh cannot render');

  fixture.reply.mockReturnValueOnce({ error: failure.message });

  const failed = await renderThumbnailImage(job).catch((error: unknown) => error);
  const next = await renderThumbnailImage(job).catch((error: unknown) => error);

  expect(failed).toEqual(failure);
  expect(next).toBe('data:image/webp;base64,dGh1bWJuYWls');
  expect(spawn).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  expect(fixture.local).not.toHaveBeenCalled();
  expect(worker.terminate).not.toHaveBeenCalled();
});

it('preserves mesh preparation errors without poisoning the next worker request', async () => {
  const { renderThumbnailImage } = await import('./thumbnailClient');

  fixture.meshes.mockRejectedValueOnce(new Error('Mesh preparation failed'));

  const failed = await renderThumbnailImage(job).catch((error: unknown) => error);
  const next = await renderThumbnailImage(job).catch((error: unknown) => error);

  expect(failed).toEqual(new Error('Mesh preparation failed'));
  expect(next).toBe('data:image/webp;base64,dGh1bWJuYWls');
  expect(worker.postMessage).toHaveBeenCalledOnce();
  expect(fixture.local).not.toHaveBeenCalled();
});

it('settles every pending thumbnail after worker loss without rendering on the page', async () => {
  const { renderThumbnailImage } = await import('./thumbnailClient');

  fixture.reply.mockReturnValue(null);

  const pending = Promise.all([renderThumbnailImage(job), renderThumbnailImage(job)]);

  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
  worker.onerror?.({ message: 'Thumbnail worker stopped' });
  expect(await pending).toEqual(['', '']);
  expect(await renderThumbnailImage(job)).toBe('');
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(spawn).toHaveBeenCalledOnce();
  expect(fixture.local).not.toHaveBeenCalled();
});

it.each(['missing', 'refused'])('exports complete scene bytes when thumbnail worker startup is %s', async (kind) => {
  if (kind === 'missing') vi.stubGlobal('Worker', undefined);
  else
    spawn.mockImplementation(() => {
      throw new Error('Worker startup refused');
    });

  const { scenePreview } = await import('./scenePreview');
  const preview = await scenePreview(job.parts);
  const scene = sharedScene({
    name: 'Portable carrier',
    globalGoal: '',
    parts: job.parts,
    project: { ...DEFAULT_PROJECT, budgetUsd: 37 },
    ...preview,
  });
  const restored = await decodeSceneFile(await encodeSceneFile(scene));

  expect(restored.parts).toEqual(job.parts);
  expect(restored.project?.budgetUsd).toBe(37);
  expect(restored.sizeMm).toEqual([40, 20, 30]);
  expect(restored.previewDataUrl).toBeUndefined();
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(fixture.local).not.toHaveBeenCalled();
});

it('does not acquire a worker for an empty thumbnail', async () => {
  const { renderThumbnailImage } = await import('./thumbnailClient');

  expect(await renderThumbnailImage({ ...job, parts: [] })).toBe('');
  expect(spawn).not.toHaveBeenCalled();
  expect(fixture.meshes).not.toHaveBeenCalled();
  expect(fixture.local).not.toHaveBeenCalled();
});
