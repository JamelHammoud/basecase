import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraTrainingFrame, CameraTrainingRequest } from './trainingTypes';
import { cameraFeed } from './viewsClient';

const stage = vi.hoisted(() => ({
  load: vi.fn(async () => true),
  frame: vi.fn(),
  training: vi.fn(),
  infer: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  ensure: vi.fn(async () => undefined),
  port: { close: vi.fn() },
}));

vi.mock('./cameraStage', () => ({
  loadCameraStage: stage.load,
  renderCameraFrame: stage.frame,
  renderTrainingFrame: stage.training,
}));
vi.mock('./visionFrames', () => ({ visionBitmapCopier: () => vi.fn() }));
vi.mock('./shotVision', () => ({ createShotVision: () => stage }));
vi.mock('./visionSession', () => ({
  connectVisionFrames: async () => stage.port,
  ensureVisionCamera: stage.ensure,
  visionAssignments: () => [{ camera: 'scene', modelId: 'objects', fps: 5 }],
}));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: async () => ({}) }));

interface Request {
  id: number;
  op: string;
  payload: unknown;
}

const scope = {
  onmessage: (_event: MessageEvent<Request>): Promise<void> => Promise.resolve(),
  postMessage: vi.fn(),
};

class CameraWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  terminate = vi.fn();

  constructor() {
    scope.postMessage.mockImplementation((data) => this.onmessage?.({ data } as MessageEvent));
  }

  postMessage(data: Request) {
    void scope.onmessage({ data } as MessageEvent<Request>);
  }
}

const request: CameraTrainingRequest = {
  key: 'scene',
  poses: null,
  width: 1,
  height: 1,
  seed: 7,
  keypoints: [],
};
const labelled: CameraTrainingFrame = {
  width: 1,
  height: 1,
  jpeg: new Uint8Array([255, 216, 255, 217]),
  instanceIds: new Uint32Array([1]),
  depth: new Float32Array([500]),
  keypoints: [],
  instances: [{ id: 1, instance: 'block' }],
  variants: {},
};

beforeAll(async () => {
  vi.stubGlobal('self', scope);
  await import('./views.worker');
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Worker', CameraWorker);
  stage.training.mockResolvedValue(labelled);
  stage.frame.mockReturnValue({ scene: { width: 1, height: 1 } });
  stage.infer.mockResolvedValue({ detections: [{ label: 'cup', score: 0.9, box: [0, 0, 1, 1] }] });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared camera capture worker', () => {
  it('captures training labels without downloading or connecting an inference model', async () => {
    const feed = cameraFeed();

    await feed.load({ parts: [], world: [], model: null, views: [] });
    expect(await feed.training(request)).toEqual(labelled);
    expect(stage.ensure).not.toHaveBeenCalled();
    expect(stage.connect).not.toHaveBeenCalled();
    expect(stage.infer).not.toHaveBeenCalled();
    feed.dispose();
    await Promise.resolve();
  });

  it('returns inferred shots and labelled training frames through the same client and releases vision', async () => {
    const feed = cameraFeed();

    await feed.load({ parts: [], world: [], model: null, views: [] });

    const shot = await feed.frame({ keys: ['scene'], poses: null });
    const training = await feed.training(request);

    expect(shot.bitmaps.scene).toEqual({ width: 1, height: 1 });
    expect(shot.vision.scene.detections[0].label).toBe('cup');
    expect(stage.connect).toHaveBeenCalledWith(stage.port, [{ camera: 'scene', modelId: 'objects', fps: 5 }]);
    expect(training).toEqual(labelled);
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: labelled }), [
      labelled.jpeg.buffer,
      labelled.instanceIds.buffer,
      labelled.depth.buffer,
    ]);
    expect(stage.infer).toHaveBeenCalledOnce();
    feed.dispose();
    await Promise.resolve();
    expect(stage.close).toHaveBeenCalledOnce();
  });

  it('keeps both capture formats available without a worker', async () => {
    vi.stubGlobal('Worker', undefined);

    const feed = cameraFeed();

    await feed.load({ parts: [], world: [], model: null, views: [] });
    expect(await feed.frame({ keys: ['scene'], poses: null })).toEqual({
      bitmaps: { scene: { width: 1, height: 1 } },
      vision: {},
    });
    expect(await feed.training(request)).toEqual(labelled);
    expect(stage.infer).not.toHaveBeenCalled();
    feed.dispose();
    await Promise.resolve();
  });
});
