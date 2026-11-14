import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { workerClient } from '../utils/workerRpc';
import { desktopFrameSets } from './desktopFrameSets';
import type { FrameSet, ImageClass, TrainingFrame } from './frameSet';
import {
  checkedFrameId,
  type FrameSetBackend,
  type FrameSetManifest,
  type FrameSetSummary,
} from './frameSetStoreTypes';
import { webFrameSets } from './webFrameSets';
import type { frameStoreJobs } from './frameStoreJobs';

export type { FrameSetManifest, FrameSetSummary, StoredFrame } from './frameSetStoreTypes';

const backend: FrameSetBackend = IS_WEB_DEMO ? webFrameSets : desktopFrameSets;
const jobs = workerClient<typeof frameStoreJobs>(
  () => new Worker(new URL('./frameStore.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./frameStoreJobs')).frameStoreJobs,
);

export async function saveFrameSet(set: FrameSet): Promise<void> {
  const manifest = await jobs.call('manifest', set);

  checkedFrameId(set.id);

  for (const frame of set.frames) {
    checkedFrameId(frame.id);
    await saveTrainingFrame(set.id, frame, set.classes);
  }

  await backend.saveManifest(manifest);
}

export async function saveTrainingFrame(id: string, frame: TrainingFrame, classes: ImageClass[]): Promise<void> {
  checkedFrameId(id);
  checkedFrameId(frame.id);
  await backend.saveFrame(id, frame.id, await jobs.call('packFrame', { frame, classes }));
}

export async function finalizeFrameSet(manifest: FrameSetManifest, sourceId?: string): Promise<void> {
  checkedFrameId(manifest.id);

  if (sourceId) checkedFrameId(sourceId);

  await backend.saveManifest(await jobs.call('header', manifest), sourceId);
}

export async function loadFrameSetManifest(id: string): Promise<FrameSetManifest | null> {
  const manifest = await backend.manifest(checkedFrameId(id));

  if (!manifest) return null;

  try {
    return await jobs.call('header', manifest);
  } catch {
    return null;
  }
}
export async function listFrameSets(): Promise<FrameSetSummary[]> {
  const summaries: FrameSetSummary[] = [];

  for (const summary of await backend.list()) {
    try {
      summaries.push(await jobs.call('summary', summary));
    } catch {
      continue;
    }
  }

  return summaries;
}
export const loadFrameJpeg = (id: string, frameId: string) => backend.jpeg(checkedFrameId(id), checkedFrameId(frameId));

async function readFrame(manifest: FrameSetManifest, frameId: string): Promise<TrainingFrame | null> {
  const frame = manifest.frames.find((f) => f.id === checkedFrameId(frameId));

  if (!frame) return null;

  const bytes = await backend.frame(manifest.id, frame.id);

  if (!bytes) return null;

  const loaded = { ...frame, ...(await jobs.call('unpack', bytes)) };

  await jobs.call('validate', { ...manifest, frames: [loaded] });

  return loaded;
}

export async function loadTrainingFrame(id: string, frameId: string): Promise<TrainingFrame | null> {
  const manifest = await loadFrameSetManifest(id);

  return manifest ? readFrame(manifest, frameId) : null;
}

export async function loadFrameSet(id: string): Promise<FrameSet | null> {
  const manifest = await loadFrameSetManifest(id);

  if (!manifest) return null;

  const frames: TrainingFrame[] = [];

  for (const frame of manifest.frames) {
    const loaded = await readFrame(manifest, frame.id);

    if (!loaded) throw new Error('The dataset is missing an image.');

    frames.push(loaded);
  }

  const set = { ...manifest, frames };

  return set;
}
