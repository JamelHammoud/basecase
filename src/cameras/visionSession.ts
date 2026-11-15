import { visionModel } from '../vision/catalogue';
import type { VisionResult } from '../vision/types';
import type { VisionManifest } from '../vision/manifest';
import { errorMessage } from '../utils/errorMessage';
import { visionRuntime } from '../vision/runtime';
import type { VisionAssignment } from './visionFrames';
import { preferredVisionDetections, visionSignalClass, visionSignalValues } from './visionSignals';

const DEFAULT_MODEL = 'rfdetr-nano';
const assignments = new Map<string, VisionAssignment>();
const baselines = new Map<string, VisionAssignment>();
const cameraLeases = new Map<string, Map<symbol, VisionAssignment>>();
const results = new Map<string, VisionResult>();
const snapshots = new Map<string, VisionResult>();
const errors = new Map<string, string>();
const minimum = new Map<string, number>();
const manifests = new Map<string, VisionManifest>();
const signalCache = new Map<string, { version: number; values: Record<string, number> }>();
let signalVersion = 0;
const loaded = new Map<string, Promise<void>>();
const listeners = new Set<(camera?: string) => void>();
const configurations = new Set<(camera?: string) => void>();
const knownSignals = new Set<string>();
const resultListeners = new Set<(result: VisionResult) => void>();
const requested = new Set<string>();
const cameraEpochs = new Map<string, number>();
const cameraSources = new Map<object, string[]>();
let watching = false;

const changed = (camera?: string) => {
  signalVersion++;
  listeners.forEach((listen) => listen(camera));
};
const identity = (camera: string, modelId: string) => `${camera}:${modelId}`;
const privateCamera = (camera: string) => camera.startsWith('routine-l2:') || camera.startsWith('camera-shot:');

function watch() {
  if (watching) return;

  watching = true;
  visionRuntime().subscribe(publishCameraVision);
  visionRuntime().onError((error) => {
    if (!error.camera) return failVisionSession(error.error);

    if (privateCamera(error.camera)) return;

    const camera = error.source ? `${error.source.id}/${error.camera}` : error.camera;

    if (error.timestamp !== undefined && error.timestamp < (minimum.get(camera) ?? -Infinity)) return;

    errors.set(camera, error.error);
    clearVisionCamera(camera);
  });
}

function failVisionSession(message: string) {
  for (const camera of availableVisionCameras()) errors.set(camera, message);

  loaded.clear();
  results.clear();
  snapshots.clear();
  assignments.clear();
  baselines.clear();
  cameraLeases.clear();
  requested.clear();
  configurations.forEach((listen) => listen());
  changed();
}

export function publishCameraVision(incoming: VisionResult) {
  if (!incoming.camera || privateCamera(incoming.camera)) return;

  const result = incoming.source ? { ...incoming, camera: `${incoming.source.id}/${incoming.camera}` } : incoming;

  if (
    !result.camera ||
    result.camera.startsWith('routine-l2:') ||
    result.camera.startsWith('camera-shot:') ||
    result.timestamp < (minimum.get(result.camera) ?? -Infinity)
  )
    return;

  const id = identity(result.camera, result.modelId);
  const previous = results.get(id);

  if (previous && previous.timestamp > result.timestamp) return;

  results.set(id, result);

  const cameraResults = [...results.values()].filter((value) => value.camera === result.camera);
  const latest = cameraResults.reduce((newest, value) => (value.timestamp > newest.timestamp ? value : newest), result);

  snapshots.set(result.camera, { ...latest, detections: preferredVisionDetections(cameraResults) });

  for (const detection of result.detections)
    knownSignals.add(`vision.${result.camera}.${visionSignalClass(detection.label)}`);

  errors.delete(result.camera);
  resultListeners.forEach((listen) => listen(result));
  changed(result.camera);
}

export function onCameraVision(listener: (camera?: string) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function onVisionAssignments(listener: (camera?: string) => void): () => void {
  configurations.add(listener);

  return () => {
    configurations.delete(listener);
  };
}

export function cameraVision(camera: string, modelId?: string): VisionResult | null {
  if (modelId) return results.get(identity(camera, modelId)) ?? null;

  return snapshots.get(camera) ?? null;
}

export function subscribeVisionResult(listener: (result: VisionResult) => void): () => void {
  resultListeners.add(listener);

  return () => {
    resultListeners.delete(listener);
  };
}

function releaseVisionCameras(cameras: string[]) {
  for (const camera of cameras) {
    if (availableVisionCameras().includes(camera)) continue;

    cameraEpochs.set(camera, (cameraEpochs.get(camera) ?? 0) + 1);

    for (const [id, assignment] of assignments)
      if (assignment.camera === camera) {
        assignments.delete(id);
        baselines.delete(id);
        cameraLeases.delete(id);
        requested.delete(id);
      }

    errors.delete(camera);
    invalidateVisionCamera(camera);
    configurations.forEach((listen) => listen(camera));
  }
}

export function registerVisionCameras(owner: object, cameras: string[]) {
  const previous = cameraSources.get(owner) ?? [];

  cameraSources.set(owner, cameras);
  releaseVisionCameras(previous);

  return () => {
    if (cameraSources.get(owner) !== cameras) return;

    cameraSources.delete(owner);
    releaseVisionCameras(cameras);
  };
}

export const availableVisionCameras = () => [...new Set([...cameraSources.values()].flat())];

export function setCameraVisionError(camera: string, message: string, timestamp?: number) {
  errors.set(camera, message);
  invalidateVisionCamera(camera, timestamp);
}

export const cameraVisionError = (camera: string) => errors.get(camera) ?? null;
export const visionAssignments = () => [...assignments.values()];
export const visionNeedsFrames = (cameras: string[]) =>
  [...assignments].some(([id, a]) => requested.has(id) && cameras.includes(a.camera));

export function invalidateVisionCamera(camera: string, timestamp = performance.now()) {
  minimum.set(camera, timestamp);
  clearVisionCamera(camera);
}

function clearVisionCamera(camera: string) {
  snapshots.delete(camera);

  for (const [id, result] of results) if (result.camera === camera) results.delete(id);

  changed(camera);
}

export function loadVisionManifest(manifest: VisionManifest, bytes?: Uint8Array): Promise<void> {
  watch();

  const pending =
    (!bytes && loaded.get(manifest.id)) ||
    visionRuntime()
      .load(manifest, bytes)
      .then(() => undefined);

  manifests.set(manifest.id, manifest);
  loaded.set(manifest.id, pending);
  void pending.catch(() => {
    if (loaded.get(manifest.id) === pending) loaded.delete(manifest.id);
  });

  return pending;
}

export function ensureVisionModel(modelId: string): Promise<void> {
  const existing = loaded.get(modelId);

  if (existing) return existing;

  const manifest = visionModel(modelId);

  if (!manifest) return Promise.reject(new Error(`No vision model ${modelId}.`));

  return loadVisionManifest(manifest);
}

function commitCameraAssignment(camera: string, modelId: string) {
  const id = identity(camera, modelId);
  const baseline = baselines.get(id);
  const choices = [...(baseline ? [baseline] : []), ...(cameraLeases.get(id)?.values() ?? [])];
  const continuous = choices.some((choice) => choice.continuous !== false);

  if (choices.length)
    assignments.set(id, { camera, modelId, fps: Math.max(...choices.map((choice) => choice.fps)), continuous });
  else assignments.delete(id);

  if (continuous) requested.add(id);
  else requested.delete(id);

  for (const label of manifests.get(modelId)?.classes ?? [])
    if (label) knownSignals.add(`vision.${camera}.${visionSignalClass(label)}`);

  errors.delete(camera);
  configurations.forEach((listen) => listen(camera));
  changed(camera);
}

async function prepareCameraModel(camera: string, modelId: string, current: () => boolean) {
  const epoch = cameraEpochs.get(camera) ?? 0;
  const active = () => current() && (cameraEpochs.get(camera) ?? 0) === epoch;

  try {
    await ensureVisionModel(modelId);

    return active;
  } catch (error) {
    if (active()) {
      errors.set(camera, errorMessage(error));
      changed(camera);
    }

    throw error;
  }
}

export async function configureVisionCamera(
  camera: string,
  options: { modelId: string; fps?: number; continuous?: boolean },
) {
  const current = await prepareCameraModel(camera, options.modelId, () => true);

  if (!current()) return;

  baselines.set(identity(camera, options.modelId), {
    camera,
    modelId: options.modelId,
    fps: Math.min(30, Math.max(1, options.fps ?? 5)),
    continuous: options.continuous !== false,
  });
  commitCameraAssignment(camera, options.modelId);
}

export async function acquireVisionCamera(
  camera: string,
  options: { modelId: string; fps?: number; current: () => boolean },
): Promise<() => void> {
  const current = await prepareCameraModel(camera, options.modelId, options.current);

  if (!current()) return () => undefined;

  const id = identity(camera, options.modelId);
  const owner = Symbol(id);
  const leases = cameraLeases.get(id) ?? new Map<symbol, VisionAssignment>();

  leases.set(owner, {
    camera,
    modelId: options.modelId,
    fps: Math.min(30, Math.max(1, options.fps ?? 5)),
    continuous: true,
  });
  cameraLeases.set(id, leases);
  commitCameraAssignment(camera, options.modelId);

  const release = () => {
    if (!cameraLeases.get(id)?.delete(owner)) return;

    if (!leases.size) cameraLeases.delete(id);

    commitCameraAssignment(camera, options.modelId);
  };

  if (!options.current()) release();

  return release;
}

export async function ensureVisionCamera(camera: string): Promise<void> {
  if ([...baselines.values()].some((assignment) => assignment.camera === camera)) return;

  await configureVisionCamera(camera, { modelId: DEFAULT_MODEL, continuous: false });
}

export async function connectVisionFrames(): Promise<MessagePort> {
  watch();

  const channel = new MessageChannel();

  visionRuntime().connect(channel.port1);

  return channel.port2;
}

export function cameraVisionSignals(cameras?: string[]): Record<string, number> {
  const key = JSON.stringify(cameras ?? null);
  const cached = signalCache.get(key);

  if (cached?.version === signalVersion) return cached.values;

  const latest = [...results.values()].filter(
    (result) => !!result.camera && (!cameras || cameras.includes(result.camera)),
  );
  const known = [...knownSignals].filter((name) => !cameras || cameras.includes(name.split('.')[1]));
  const values = visionSignalValues(latest, known);

  signalCache.set(key, { version: signalVersion, values });

  return values;
}

export function stopVisionCamera(camera: string, modelId?: string) {
  for (const [id, assignment] of baselines) {
    if (assignment.camera !== camera || (modelId && assignment.modelId !== modelId)) continue;

    if (assignment.modelId !== DEFAULT_MODEL) baselines.delete(id);
    else baselines.set(id, { ...assignment, continuous: false });

    commitCameraAssignment(camera, assignment.modelId);
  }

  invalidateVisionCamera(camera);
}
