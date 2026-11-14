import { VisionEngine } from './engine';
import { compactDepth } from './depth';
import { VisionFrameQueue } from './frameQueue';
import { disposePoseVision, inferPoseVision, loadPoseVision } from './poseInference';
import type { VisionFrame, VisionReply, VisionRequest, VisionResult } from './protocol';

const engine = new VisionEngine();
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<VisionRequest>) => void) | null;
  postMessage: (message: VisionReply, transfer?: Transferable[]) => void;
};
const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true });
const cameras = new Map<string, string[]>();
const latest = new Map<string, number>();
const ports = new Map<string, MessagePort>();
const origins = new WeakMap<ImageBitmap, { key: string; port: MessagePort }>();
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'The camera model stopped.');

function currentSource(frame: VisionFrame): boolean {
  const origin = origins.get(frame.image);

  return !origin || ports.get(origin.key) === origin.port;
}

function readFrame(image: ImageBitmap) {
  if (!context) throw new Error('Camera frames couldn’t be read.');

  if (canvas.width !== image.width) canvas.width = image.width;

  if (canvas.height !== image.height) canvas.height = image.height;

  context.drawImage(image, 0, 0);

  return context.getImageData(0, 0, image.width, image.height);
}

async function infer(
  modelId: string,
  frame: VisionFrame,
  threshold?: number,
  pixels?: ImageData,
): Promise<VisionResult> {
  const metadata = { camera: frame.camera, timestamp: frame.timestamp, mediaTime: frame.mediaTime, threshold };

  const result =
    modelId === 'pose'
      ? await inferPoseVision(frame.image, metadata)
      : await engine.infer(modelId, pixels ?? readFrame(frame.image), metadata);

  return { ...result, mediaTime: frame.mediaTime, mediaSource: frame.mediaSource, depth: compactDepth(result.depth) };
}

async function streamFrame(frame: VisionFrame): Promise<void> {
  if (!currentSource(frame)) return;

  const modelIds = cameras.get(frame.camera) ?? [];

  if (frame.timestamp <= (latest.get(frame.camera) ?? -Infinity)) return;

  latest.set(frame.camera, frame.timestamp);

  const pixels = modelIds.some((id) => id !== 'pose') ? readFrame(frame.image) : undefined;

  for (const modelId of modelIds) {
    const result = await infer(modelId, frame, undefined, pixels);

    if (currentSource(frame) && cameras.get(frame.camera)?.includes(modelId)) postResult({ type: 'result', result });
  }
}

const queue = new VisionFrameQueue(streamFrame, (error, frame) => {
  if (currentSource(frame)) scope.postMessage({ type: 'error', camera: frame.camera, error: errorText(error) });
});

async function request(
  message: Extract<VisionRequest, { id: number }>,
): Promise<VisionResult | { backend: 'webgpu' | 'wasm' } | null> {
  if (message.type === 'load') return engine.load(message.model, new Uint8Array(message.bytes));

  if (message.type === 'load-pose') return loadPoseVision();

  if (message.type === 'infer') {
    try {
      return await infer(message.modelId, message, message.threshold);
    } finally {
      message.image.close();
    }
  }

  if (!message.modelId || message.modelId === 'pose') disposePoseVision();

  await engine.dispose(message.modelId);

  return null;
}

function configure(next: Record<string, string[]>): void {
  cameras.clear();

  for (const [camera, ids] of Object.entries(next)) cameras.set(camera, ids);

  latest.clear();
}

function postResult(message: VisionReply): void {
  const result = 'result' in message && message.result && 'modelId' in message.result ? message.result : null;
  const transfer: Transferable[] = [];

  if (result?.depth) transfer.push(result.depth.values.buffer as ArrayBuffer);

  for (const detection of result?.detections ?? []) {
    if (detection.mask) transfer.push(detection.mask.values.buffer as ArrayBuffer);
  }

  scope.postMessage(message, transfer);
}

scope.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'disconnect') {
    ports.get(message.source)?.close();
    ports.delete(message.source);

    return;
  }

  if (message.type === 'configure') {
    configure(message.cameras);

    return;
  }

  if (message.type === 'port') {
    const key = message.source ?? crypto.randomUUID();

    ports.get(key)?.close();
    ports.set(key, message.port);
    message.port.onmessage = (frameEvent: MessageEvent<VisionFrame>) => {
      origins.set(frameEvent.data.image, { key, port: message.port });
      queue.push(frameEvent.data);
    };
    message.port.onmessageerror = () => message.port.close();
    message.port.start();

    return;
  }

  void request(message)
    .then((result) => postResult({ id: message.id, ok: true, result }))
    .catch((error: unknown) => scope.postMessage({ id: message.id, ok: false, error: errorText(error) }));
};
