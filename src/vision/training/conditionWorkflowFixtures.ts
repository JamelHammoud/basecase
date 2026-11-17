import sharp from 'sharp';
import { metricSet } from './metricsFixtures';
import { preparationFixture, preparationTry } from './prepareFixtures';
import { prepareVisionTraining } from './prepare';
import { labelGeometry } from '../labelEdits';
import { constantVisionOnnx, inputSensitiveDetectionOnnx } from '../onnxFixture';
import { datasetContentHash } from '../../datasets/contentHash';
import type { VisionManifest } from '../manifest';
import type { TrainingKind } from './types';
import type { ImageGroup } from './conditionEvaluation';
import type { TrySplit } from '../../cases/tryFile';

interface Workflow {
  name: string;
  kind: TrainingKind;
  mode: 'brightness' | 'small' | 'occluded' | 'class-error' | 'mask' | 'points' | 'classification' | 'import';
  group: ImageGroup;
  expectedKeys: string[];
  candidate: number | null;
  incumbent: number | null;
}

export const CONDITION_WORKFLOWS: Workflow[] = [
  {
    name: 'day and night rover images',
    kind: 'detect',
    mode: 'brightness',
    group: { kind: 'condition', name: 'night' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'front and wrist cameras',
    kind: 'detect',
    mode: 'brightness',
    group: { kind: 'camera', name: 'wrist' },
    expectedKeys: ['wrist-set:sample-0'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'small and large detected objects',
    kind: 'detect',
    mode: 'small',
    group: { kind: 'condition', name: 'small' },
    expectedKeys: ['conditions:sample-0'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'occluded arm targets',
    kind: 'detect',
    mode: 'occluded',
    group: { kind: 'condition', name: 'occluded' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'reflective inspection surfaces',
    kind: 'detect',
    mode: 'class-error',
    group: { kind: 'condition', name: 'reflective' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'warehouse and outdoor sources',
    kind: 'detect',
    mode: 'brightness',
    group: { kind: 'source', name: 'try:outdoor' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'segmentation under supplied glare',
    kind: 'segment',
    mode: 'mask',
    group: { kind: 'condition', name: 'glare' },
    expectedKeys: ['conditions:sample-1', 'conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'partially visible arm landmarks',
    kind: 'keypoints',
    mode: 'points',
    group: { kind: 'condition', name: 'partial' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'imbalanced appliance classification',
    kind: 'classify',
    mode: 'classification',
    group: { kind: 'condition', name: 'rare appliance' },
    expectedKeys: ['conditions:sample-2'],
    candidate: 0,
    incumbent: 1,
  },
  {
    name: 'imported images without robot provenance',
    kind: 'detect',
    mode: 'import',
    group: { kind: 'condition', name: 'night' },
    expectedKeys: [],
    candidate: null,
    incumbent: null,
  },
];

function suppliedLabels(test: Workflow, index: number) {
  if (index < 2) return [];

  const labels = index === 4 ? ['night', 'glare'] : ['day'];

  if (index === 3) labels.push('glare');

  if (index === 2 && test.mode === 'small') labels.push('small');

  if (index === 4 && ['occluded', 'class-error', 'points', 'classification'].includes(test.mode)) {
    labels.push(
      (
        {
          occluded: 'occluded',
          'class-error': 'reflective',
          points: 'partial',
          classification: 'rare appliance',
        } as Record<string, string>
      )[test.mode],
    );
  }

  return labels;
}

function target(test: Workflow, index: number) {
  const small = (test.mode === 'small' && index === 2) || (test.mode === 'occluded' && index === 4);
  const pixels = Uint8Array.from({ length: 64 }, (_, at) => Number(!small || (at % 8 < 2 && at < 16)));

  return labelGeometry({
    width: 8,
    height: 8,
    pixels,
    instance: 'reviewed-target',
    classId: test.mode === 'classification' && index === 4 ? 2 : 1,
    keypoints: [
      { name: 'center', x: 4, y: 4, visible: true },
      { name: 'hidden', x: -1, y: -1, visible: false },
    ],
  });
}

export async function conditionWorkflowFixture(test: Workflow) {
  const set = metricSet();
  const splits = ['train', 'validation', 'test', 'test', 'test'] as const;
  const sources = ['training', 'validation', 'warehouse', 'warehouse', 'outdoor'];

  set.id = 'conditions';
  set.conditions = ['day', 'night', 'glare', 'small', 'occluded', 'reflective', 'partial', 'rare appliance', 'empty'];

  if (test.kind === 'classify')
    set.classes = [
      { id: 1, name: 'Microwave' },
      { id: 2, name: 'Refrigerator' },
    ];

  set.classes.forEach((category) => {
    category.keypoints = ['center', 'hidden'];
  });
  set.frames = await Promise.all(
    splits.map(async (split, index) => ({
      ...structuredClone(set.frames[0]),
      id: index < 2 ? split : `sample-${index - 2}`,
      width: 8,
      height: 8,
      camera: index === 4 ? 'wrist' : 'front',
      jpeg: new Uint8Array(
        await sharp({
          create: {
            width: 8,
            height: 8,
            channels: 3,
            background: {
              r: [3, 7, 224, 240, 32][index],
              g: [3, 7, 224, 240, 32][index],
              b: [3, 7, 224, 240, 32][index],
            },
          },
        })
          .jpeg()
          .toBuffer(),
      ),
      depth: new Float32Array(64),
      annotations: [{ ...target(test, index), source: 'manual' as const, review: 'accepted' as const }],
      conditions: suppliedLabels(test, index),
      split,
      ...(test.mode === 'import'
        ? { source: 'import' as const, origin: undefined }
        : {
            origin: { tryId: sources[index], frame: index, seconds: index / 50 },
          }),
    })),
  );

  const sets = [set];

  if (test.name === 'front and wrist cameras') {
    const wrist = { ...structuredClone(set), id: 'wrist-set', frames: [{ ...set.frames[4], id: 'sample-0' }] };

    set.frames = set.frames.slice(0, 4);
    sets.push(wrist);
  }

  const sourceSplits: Record<string, TrySplit> = {
    training: 'train',
    validation: 'validation',
    warehouse: 'test',
    outdoor: 'test',
  };
  const manifests = [...new Set(sources)].map((id) => ({ ...preparationTry(id), split: sourceSplits[id] }));

  const fixture = await preparationFixture(sets, test.mode === 'import' ? [] : manifests);
  const prepared = await prepareVisionTraining(fixture.dataset, test.kind, { ports: fixture.ports });

  return { fixture, prepared };
}

function outputModel(test: Workflow, candidate: boolean) {
  if (test.mode === 'brightness')
    return inputSensitiveDetectionOnnx(
      [0, 0, 1, 1, candidate ? 0.01 : 0.95, 0],
      [0, 0, 0, 0, candidate ? 0.9 : -0.9, 0],
    );

  if (test.kind === 'classify')
    return constantVisionOnnx({ classes: { dims: [1, 2], values: candidate ? [0.9, 0.1] : [0.1, 0.9] } });

  return constantVisionOnnx(objectOutputs(test, candidate));
}

function objectOutputs(test: Workflow, candidate: boolean) {
  const small = !candidate && ['small', 'occluded'].includes(test.mode);
  const outputs: Record<string, { dims: number[]; values: number[] }> = {
    detections: {
      dims: [1, 1, 6],
      values: [0, 0, small ? 0.25 : 1, small ? 0.25 : 1, 0.9, Number(candidate && test.mode === 'class-error')],
    },
  };

  if (test.kind === 'segment')
    outputs.masks = {
      dims: [1, 1, 8, 8],
      values: Array.from({ length: 64 }, (_, at) => Number(!candidate || (at % 8 < 2 && at < 16))),
    };

  if (test.kind === 'keypoints')
    outputs.keypoints = { dims: [1, 1, 2, 2], values: candidate ? [0, 0, 0.5, 0.5] : [0.5, 0.5, 0, 0] };

  return outputs;
}

export async function conditionModel(test: Workflow, candidate: boolean) {
  const bytes = outputModel(test, candidate);
  const hash = await datasetContentHash(bytes);
  const manifest: VisionManifest = {
    version: 1,
    id: `condition-${hash.slice(0, 24)}`,
    kind: test.kind,
    adapter: 'generic',
    classes: test.kind === 'classify' ? ['Microwave', 'Refrigerator'] : ['Cup', 'Plate'],
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
    model: { source: 'local', sha256: hash, bytes: bytes.length },
  };

  return { bytes, manifest };
}
