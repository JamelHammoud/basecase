import { switchVisionSource } from './sourceSwitch';
import { getVisionModel } from './modelStore';
import { visionModel, type VisionModelManifest } from './manifest';
import type { VisionReply, VisionRequest, VisionResult } from './protocol';
import { setVisionError } from './statusStore';
import { clearVisionResults, keepVisionResult } from './resultStore';

type Source = (port: MessagePort, cameras: string[]) => void;

interface SourceOptions {
  exclusive?: string[];
}

type Pending = { resolve: (result: VisionResult | unknown) => void; reject: (error: Error) => void };

const sources = new Set<Source>();
const sourceIds = new Map<Source, string>();
const sourceOptions = new Map<Source, SourceOptions>();
const sourceChanges = new Set<() => void>();
const listeners = new Set<() => void>();
const bindings = new Map<string, Map<string, number>>();
const loaded = new Map<string, Promise<unknown>>();
const provided = new Map<string, { model: VisionModelManifest; bytes: ArrayBuffer }>();
const pending = new Map<number, Pending>();
const disposals = new Map<string, Promise<unknown>>();
const started = new Map<string, number>();
let cameras: readonly string[] = [];
let worker: Worker | null = null;
let sequence = 0;
let sourceSequence = 0;
let error: string | null = null;

export const visionCameras = () => cameras;
export const visionError = () => error;

export function onVisionCameras(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function acceptResult(result: VisionResult): void {
  const began = started.get(`${result.camera}:${result.modelId}`) ?? Infinity;

  if (!bindings.get(result.camera)?.has(result.modelId) || result.timestamp < began) return;

  error = null;
  setVisionError(result.camera, null);
  keepVisionResult(result);
}

function pushed(reply: Extract<VisionReply, { type: string }>) {
  if (reply.type === 'result') return acceptResult(reply.result);

  error = reply.error;

  if (reply.camera) {
    setVisionError(reply.camera, reply.error);
    clearVisionResults(reply.camera);
  }
}

function receive(reply: VisionReply) {
  if ('type' in reply) return pushed(reply);

  const waiting = pending.get(reply.id);

  pending.delete(reply.id);

  if (reply.ok) waiting?.resolve(reply.result);
  else waiting?.reject(new Error(reply.error));
}

function engine(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<VisionReply>) => receive(data);
  worker.onerror = (event) => {
    error = event.message;
    pending.forEach((waiting) => waiting.reject(new Error(event.message)));
    pending.clear();
  };

  return worker;
}

function request(message: VisionRequest, transfer: Transferable[] = []): Promise<unknown> {
  if (!('id' in message)) throw new Error('Vision request needs an id.');

  const response = new Promise((resolve, reject) => pending.set(message.id, { resolve, reject }));

  engine().postMessage(message, transfer);

  return response;
}

export function loadVision(modelId: string): Promise<unknown> {
  const known = loaded.get(modelId);

  if (known) return known;

  const loading = (async () => {
    await disposals.get(modelId);

    const supplied = provided.get(modelId);

    if (supplied) {
      const bytes = supplied.bytes.slice(0);

      return request({ id: ++sequence, type: 'load', model: supplied.model, bytes }, [bytes]);
    }

    if (modelId === 'pose') return request({ id: ++sequence, type: 'load-pose' });

    const model = visionModel(modelId);

    if (!model) throw new Error(`Unknown vision model: ${modelId}`);

    const bytes = await getVisionModel(model);
    const buffer = bytes.buffer as ArrayBuffer;

    return request({ id: ++sequence, type: 'load', model, bytes: buffer }, [buffer]);
  })().catch((reason: unknown) => {
    if (loaded.get(modelId) === loading) loaded.delete(modelId);

    error = reason instanceof Error ? reason.message : String(reason);

    throw reason;
  });

  loaded.set(modelId, loading);

  return loading;
}

export function loadVisionBytes(model: VisionModelManifest, bytes: ArrayBuffer): Promise<unknown> {
  provided.set(model.id, { model, bytes: bytes.slice(0) });

  const loading = (async () => {
    await disposals.get(model.id);

    return request({ id: ++sequence, type: 'load', model, bytes }, [bytes]);
  })();

  loaded.set(model.id, loading);

  return loading;
}

function sourcePort(source: Source) {
  const channel = new MessageChannel();

  engine().postMessage({ type: 'port', port: channel.port1, source: sourceIds.get(source) } satisfies VisionRequest, [
    channel.port1,
  ]);

  const exclusive = new Set([...sourceOptions.values()].flatMap((options) => options.exclusive ?? []));
  const own = new Set(sourceOptions.get(source)?.exclusive);

  source(
    channel.port2,
    cameras.filter((camera) => !exclusive.has(camera) || own.has(camera)),
  );
}

function configure() {
  const previous = cameras;
  const configured = Object.fromEntries([...bindings].map(([camera, models]) => [camera, [...models.keys()]]));

  cameras = Object.keys(configured);
  engine().postMessage({ type: 'configure', cameras: configured } satisfies VisionRequest);
  sources.forEach(sourcePort);
  previous.filter((camera) => !bindings.has(camera)).forEach((camera) => clearVisionResults(camera));
  listeners.forEach((listener) => listener());
}

export function connectVisionSource(source: Source, options: SourceOptions = {}): () => void {
  sources.add(source);
  sourceIds.set(source, `camera-source-${++sourceSequence}`);
  sourceOptions.set(source, options);

  if (options.exclusive?.length) refreshSources(options.exclusive);
  else if (cameras.length) sourcePort(source);

  return () => {
    sources.delete(source);

    const sourceId = sourceIds.get(source);

    if (sourceId) worker?.postMessage({ type: 'disconnect', source: sourceId } satisfies VisionRequest);

    sourceIds.delete(source);
    sourceOptions.delete(source);

    if (options.exclusive?.length) refreshSources(options.exclusive);
  };
}

export async function startVision(camera: string, modelId: string): Promise<() => void> {
  if (camera === 'operator' && modelId === 'pose') return operatorPoseVision();

  return startWorkerVision(camera, modelId);
}

async function startWorkerVision(camera: string, modelId: string): Promise<() => void> {
  try {
    await loadVision(modelId);
    setVisionError(camera, null);
  } catch (reason) {
    setVisionError(camera, reason instanceof Error ? reason.message : String(reason));

    throw reason;
  }

  const models = bindings.get(camera) ?? new Map<string, number>();

  if (!models.has(modelId)) started.set(`${camera}:${modelId}`, performance.timeOrigin + performance.now());

  models.set(modelId, (models.get(modelId) ?? 0) + 1);
  bindings.set(camera, models);
  configure();

  let stopped = false;

  return () => {
    if (stopped) return;

    stopped = true;

    const count = (models.get(modelId) ?? 1) - 1;

    if (count) models.set(modelId, count);
    else {
      models.delete(modelId);
      started.delete(`${camera}:${modelId}`);
      clearVisionResults(camera, modelId);
    }

    if (!models.size) bindings.delete(camera);

    configure();

    if ([...bindings.values()].some((bound) => bound.has(modelId))) return;

    loaded.delete(modelId);
    disposals.set(modelId, request({ id: ++sequence, type: 'dispose', modelId }));
  };
}

export async function inferVision(camera: string, modelId: string, image: ImageBitmap): Promise<VisionResult> {
  try {
    await loadVision(modelId);
  } catch (reason) {
    image.close();

    throw reason;
  }

  const timestamp = performance.timeOrigin + performance.now();
  const result = (await request({ id: ++sequence, type: 'infer', modelId, camera, image, timestamp }, [
    image,
  ])) as VisionResult;

  keepVisionResult(result);

  return result;
}

function refreshSources(changed: string[]) {
  const floor = performance.timeOrigin + performance.now();

  for (const camera of changed) {
    for (const modelId of bindings.get(camera)?.keys() ?? []) started.set(`${camera}:${modelId}`, floor);

    clearVisionResults(camera);
  }

  sources.forEach(sourcePort);
  sourceChanges.forEach((change) => change());
}

export const hasExclusiveVisionSource = (camera: string) =>
  [...sourceOptions.values()].some((options) => options.exclusive?.includes(camera));

async function operatorPoseVision() {
  await Promise.resolve();

  return switchVisionSource({
    subscribe: (change) => onExclusiveSource('operator', change),
    start: async () => {
      if (hasExclusiveVisionSource('operator')) return startWorkerVision('operator', 'pose');

      const operator = await import('../cameras/operator/operatorCamera');

      return operator.ensureOperatorPoseVision();
    },
    error: (reason) => {
      error = reason instanceof Error ? reason.message : String(reason);
    },
  });
}

function onExclusiveSource(camera: string, change: () => void) {
  let previous = hasExclusiveVisionSource(camera);
  const follow = () => {
    const next = hasExclusiveVisionSource(camera);

    if (previous === next) return;

    previous = next;
    change();
  };

  sourceChanges.add(follow);

  return () => sourceChanges.delete(follow);
}
