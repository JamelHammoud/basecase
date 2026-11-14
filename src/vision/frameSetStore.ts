import { workerClient } from '../utils/workerRpc';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { isHash } from '../skills/hash';
import { manifestOf, type FrameSetManifest, type VisionFrame, type VisionFrameSet } from './frameSet';
import { desktopFrameSets, webFrameSets } from './frameSetBackends';
import type { persistenceHandlers, FrameSetSummary } from './frameSetPersistence';

export type { FrameSetSummary } from './frameSetPersistence';

const backend = IS_WEB_DEMO ? webFrameSets : desktopFrameSets;
const client = workerClient<typeof persistenceHandlers>(
  () => new Worker(new URL('./frameSetPersistence.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./frameSetPersistence')).persistenceHandlers,
);

export async function saveFrame(frame: VisionFrame): Promise<void> {
  const data = await client.call('encodeFrame', frame);

  await backend.saveFrame(frame.id, data);
}
export async function loadFrame(id: string): Promise<VisionFrame | null> {
  if (!isHash(id)) return null;

  try {
    const data = await backend.frame(id);
    const frame = data ? await client.call('decodeFrame', data) : null;

    return frame?.id === id ? frame : null;
  } catch {
    return null;
  }
}
export async function saveFrameSetManifest(manifest: FrameSetManifest): Promise<void> {
  await backend.save(await client.call('encodeManifest', manifest));
}
export async function loadFrameSetManifest(id: string): Promise<FrameSetManifest | null> {
  if (!isHash(id)) return null;

  try {
    const record = await backend.read(id);
    const manifest = record ? await client.call('decodeManifest', record.manifest) : null;

    return manifest?.id === id ? manifest : null;
  } catch {
    return null;
  }
}
export async function saveFrameSet(set: VisionFrameSet): Promise<void> {
  for (const frame of set.frames) await saveFrame(frame);

  await saveFrameSetManifest(manifestOf(set));
}
export async function loadFrameSet(id: string): Promise<VisionFrameSet | null> {
  const manifest = await loadFrameSetManifest(id);

  if (!manifest) return null;

  const frames: VisionFrame[] = [];
  const classes = new Set(manifest.classes.map((item) => item.id));

  for (const frameId of manifest.frames) {
    const frame = await loadFrame(frameId);

    if (!frame || frame.annotations.some((annotation) => !classes.has(annotation.classId))) return null;

    frames.push(frame);
  }

  return { ...manifest, frames };
}

const summaryText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 2000;
const summaryCount = (value: number, minimum: number) =>
  Number.isSafeInteger(value) && value >= minimum && value <= 10000;

function isSummary(raw: unknown): raw is FrameSetSummary {
  if (!raw || typeof raw !== 'object') return false;

  const value = raw as FrameSetSummary;

  return (
    isHash(value.id) &&
    summaryText(value.name) &&
    summaryText(value.caseId) &&
    summaryCount(value.frames, 1) &&
    summaryCount(value.classCount, 0) &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

export async function listFrameSets(): Promise<FrameSetSummary[]> {
  return (await backend.list())
    .filter(isSummary)
    .map(({ id, name, caseId, frames, classCount, createdAt }) => ({ id, name, caseId, frames, classCount, createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
