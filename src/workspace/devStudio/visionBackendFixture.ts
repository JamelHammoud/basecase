import type { FrameSet, TrainingFrame } from '../../vision/frameSet';
import { annotationFromInstances } from '../../vision/imageMasks';
import { keepTries } from '../../cases/tryStore';
import type { StoredTry, TrySplit } from '../../cases/tryFile';

const SPLITS: TrySplit[] = ['train', 'validation', 'test'];
const sourceId = (split: TrySplit) => `vision-source-${split}`;

function sourceTry(split: TrySplit): StoredTry {
  return {
    version: 1,
    id: sourceId(split),
    sceneId: 'vision-real-sources',
    robot: { name: 'Camera', modelHash: 'a'.repeat(64), joints: [] },
    case: null,
    source: 'operate',
    input: 'camera',
    startedAt: '2026-11-15T12:00:00Z',
    seconds: 0.02,
    rate: 50,
    frames: 1,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 1,
    sourceTry: null,
    faults: [],
    split,
  };
}

async function sourceFrame(split: TrySplit, index: number): Promise<TrainingFrame> {
  const canvas = new OffscreenCanvas(2, 2);
  const context = canvas.getContext('2d')!;
  const level = index * 100;

  context.fillStyle = `rgb(${level},${level},${level})`;
  context.fillRect(0, 0, 2, 2);

  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
  const annotation = annotationFromInstances({
    instanceIds: new Uint32Array([1, 1, 1, 1]),
    width: 2,
    height: 2,
    instance: 'cup',
    instanceId: 1,
    classId: 0,
  })!;

  return {
    id: `source-${split}`,
    seed: index,
    camera: 'scene',
    width: 2,
    height: 2,
    jpeg,
    depth: new Float32Array(4),
    annotations: [{ ...annotation, source: 'manual', review: 'accepted' }],
    source: 'try',
    split,
    origin: { tryId: sourceId(split), frame: 0, seconds: 0 },
  };
}

export async function realTrainingImages(): Promise<FrameSet> {
  await keepTries(SPLITS.map((split) => ({ stored: sourceTry(split), recording: null })));

  return {
    version: 1,
    id: 'vision-real-frames',
    name: 'Real cups',
    sceneId: null,
    caseId: null,
    seed: 1,
    classes: [{ id: 0, name: 'cup' }],
    createdAt: '2026-11-15T12:00:00Z',
    frames: await Promise.all(SPLITS.map(sourceFrame)),
  };
}
