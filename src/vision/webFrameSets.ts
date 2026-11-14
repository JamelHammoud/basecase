import { indexedDbStore } from '../utils/keyValueStore';
import {
  checkedFrameId,
  summaryOf,
  type FrameBytes,
  type FrameSetBackend,
  type FrameSetManifest,
} from './frameSetStoreTypes';

const manifests = indexedDbStore<FrameSetManifest>({ database: 'basecase-frame-manifests', store: 'manifests' });
const frames = indexedDbStore<Uint8Array>({ database: 'basecase-image-frames', store: 'frames' });
const key = (id: string, frameId: string) => `${checkedFrameId(id)}:${checkedFrameId(frameId)}`;

async function frameBytes(id: string, frameId: string): Promise<FrameBytes | null> {
  const stem = key(id, frameId);
  const [jpeg, depth] = await Promise.all([frames.get(`${stem}:jpeg`), frames.get(`${stem}:depth`)]);

  return jpeg && depth ? { jpeg, depth } : null;
}

export const webFrameSets: FrameSetBackend = {
  list: async () => (await manifests.values()).map(summaryOf),
  manifest: async (id) => (await manifests.get(checkedFrameId(id))) ?? null,
  frame: frameBytes,
  jpeg: async (id, frameId) => (await frames.get(`${key(id, frameId)}:jpeg`)) ?? null,
  saveFrame: async (id, frameId, bytes) => {
    const stem = key(id, frameId);

    await frames.put(`${stem}:jpeg`, bytes.jpeg);
    await frames.put(`${stem}:depth`, bytes.depth);
  },
  saveManifest: async (manifest, sourceId) => {
    const staged = sourceId && sourceId !== manifest.id ? checkedFrameId(sourceId) : null;

    checkedFrameId(manifest.id);

    if (staged) await copyFrames(manifest, staged);

    await manifests.put(checkedFrameId(manifest.id), manifest);

    if (staged) await removeStaging(staged);
  },
};

async function copyFrames(manifest: FrameSetManifest, sourceId: string) {
  checkedFrameId(sourceId);

  for (const frame of manifest.frames) {
    const bytes = await frameBytes(sourceId, frame.id);

    if (!bytes) throw new Error('The dataset is missing an image.');

    const stem = key(manifest.id, frame.id);

    await frames.put(`${stem}:jpeg`, bytes.jpeg);
    await frames.put(`${stem}:depth`, bytes.depth);
  }
}

async function removeStaging(sourceId: string) {
  await frames.deletePrefix(`${sourceId}:`);
  await manifests.delete(sourceId);
}
