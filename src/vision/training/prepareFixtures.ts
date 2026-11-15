import { newDataset, type ImageMembers } from '../../datasets/datasetFile';
import { datasetContentHash } from '../../datasets/contentHash';
import { freezeImages, restoreImages } from '../../datasets/snapshotImages';
import { frameSetHash, type FrameSet } from '../frameSet';
import { annotationFromInstances } from '../imageMasks';
import type { StoredTry } from '../../cases/tryFile';
import { snapshotHash } from '../../datasets/datasetSnapshot';
import type { PreparationPorts } from './prepare';

export function preparationSet(id = 'images'): FrameSet {
  const annotation = annotationFromInstances({
    instanceIds: new Uint32Array([1]),
    width: 1,
    height: 1,
    instance: 'block',
    instanceId: 1,
    classId: 4,
  })!;

  return {
    version: 1,
    id,
    name: 'Blocks',
    caseId: 'case',
    sceneId: 'scene',
    seed: 42,
    classes: [{ id: 4, name: 'Block' }],
    createdAt: 'now',
    frames: ['train', 'validation', 'test'].map((split, i) => ({
      id: `${id}-${i}`,
      seed: i,
      camera: 'camera',
      width: 1,
      height: 1,
      annotations: [structuredClone(annotation)],
      jpeg: new Uint8Array([255, 216, i, 255, 217]),
      depth: new Float32Array([0]),
      source: 'import',
      split: split as 'train' | 'validation' | 'test',
    })),
  };
}

export const preparationTry = (id: string, sourceTry: string | null = null): StoredTry => ({
  version: 1,
  id,
  sceneId: 'scene',
  robot: { name: 'Robot', modelHash: 'a'.repeat(64), joints: [] },
  case: null,
  source: 'operate',
  input: null,
  startedAt: 'now',
  seconds: 3,
  rate: 50,
  frames: 150,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 1,
  sourceTry,
  faults: [],
});

export async function preparationFixture(sets = [preparationSet()], manifests: StoredTry[] = []) {
  const blobs = new Map<string, Uint8Array>();
  const save = async (bytes: Uint8Array) => {
    const hash = await datasetContentHash(bytes);

    blobs.set(hash, bytes.slice());

    return hash;
  };
  const members: ImageMembers[] = [];

  for (const set of sets)
    members.push({ frameSetId: set.id, frameIds: set.frames.map((f) => f.id), hash: await frameSetHash(set) });

  const dataset = newDataset({
    id: 'dataset',
    name: 'Blocks',
    task: 'Find blocks',
    members: [],
    imageMembers: members,
    at: 'now',
  });
  const ports: PreparationPorts = {
    resolve: async () => ({
      task: dataset.task,
      modelHash: '',
      samples: [],
      images: await freezeImages(members, async (id) => sets.find((s) => s.id === id) ?? null, save),
    }),
    restore: (samples) => restoreImages(samples, async (hash) => blobs.get(hash) ?? null),
    hash: snapshotHash,
    save: async () => {},
    manifests: async (ids) => structuredClone(manifests.filter((manifest) => ids.includes(manifest.id))),
  };

  return { dataset, ports, blobs, sets };
}
