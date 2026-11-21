import sharp from 'sharp';
import { metricSet } from './metricsFixtures';
import { preparationFixture, preparationTry } from './prepareFixtures';
import { prepareVisionTraining } from './prepare';
import { constantVisionOnnx, inputSensitiveDetectionOnnx } from '../onnxFixture';
import { datasetContentHash } from '../../datasets/contentHash';
import type { TrainingKind } from './types';
import type { VisionManifest } from '../manifest';

export const EVIDENCE_CASES: {
  name: string;
  kind: TrainingKind;
  missed: number;
  extra: number;
  regression?: boolean;
}[] = [
  { name: 'missed person', kind: 'detect', missed: 1, extra: 0 },
  { name: 'duplicate detection', kind: 'detect', missed: 0, extra: 1 },
  { name: 'wrong object class', kind: 'detect', missed: 1, extra: 1 },
  { name: 'correct empty image', kind: 'detect', missed: 0, extra: 0 },
  { name: 'localization error', kind: 'detect', missed: 1, extra: 1 },
  { name: 'mask boundary error', kind: 'segment', missed: 1, extra: 1 },
  { name: 'missed visible keypoint', kind: 'keypoints', missed: 0, extra: 0 },
  { name: 'invisible keypoint', kind: 'keypoints', missed: 0, extra: 0 },
  { name: 'classification confusion', kind: 'classify', missed: 1, extra: 1 },
  { name: 'two-camera regression', kind: 'detect', missed: 1, extra: 0, regression: true },
];
export type EvidenceCase = (typeof EVIDENCE_CASES)[number];

export async function evidenceMatrixFixture(test: EvidenceCase) {
  const set = metricSet();
  const sources = ['train', 'validation', 'test'].map((id) => ({ ...preparationTry(id), split: id as 'test' }));

  if (test.name === 'missed person') set.classes[0].name = 'person';

  if (test.kind === 'keypoints') {
    set.classes.forEach((category) => {
      category.keypoints = ['center', 'hidden'];
    });
    set.frames[0].annotations[0].keypoints.push({ name: 'hidden', x: 1, y: 1, visible: false });
  }

  set.frames = await Promise.all(
    sources.map(async (source, index) => ({
      ...structuredClone(set.frames[0]),
      id: source.id,
      split: source.split,
      origin: { tryId: source.id, frame: 0, seconds: 0 },
      jpeg: new Uint8Array(
        await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: index * 100, g: 0, b: 0 } } })
          .jpeg()
          .toBuffer(),
      ),
    })),
  );

  if (test.name === 'correct empty image') set.frames[2].annotations = [];

  const sets = [set];

  if (test.regression) {
    const wrist = structuredClone(set);

    wrist.id = 'wrist-images';
    wrist.classes.reverse();
    wrist.frames = [wrist.frames[2]];
    wrist.frames[0].camera = 'wrist';
    wrist.frames[0].jpeg = new Uint8Array(
      await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
        .jpeg()
        .toBuffer(),
    );
    sets.push(wrist);
  }

  const fixture = await preparationFixture(sets, sources);
  const prepared = await prepareVisionTraining(fixture.dataset, test.kind, { ports: fixture.ports });
  const label = prepared.classes.findIndex((category) => category.name === set.classes[0].name);

  return { fixture, prepared, label };
}

function detectionRows(test: EvidenceCase, label: number, bad: boolean) {
  const missing = ['missed person', 'two-camera regression'].includes(test.name) && bad;
  const empty = test.name === 'correct empty image';
  let rows = [0, 0, 1, 1, missing || empty ? 0.01 : 0.9, label];

  if (bad && test.name === 'duplicate detection') rows = [0, 0, 0.625, 1, 0.9, label, 0.375, 0, 0.625, 1, 0.8, label];

  if (bad && test.name === 'wrong object class') rows[5] = 1 - label;

  if (bad && test.name === 'localization error') rows = [0, 0, 0.1, 0.1, 0.9, label];

  return rows;
}

function keypointValues(test: EvidenceCase, bad: boolean) {
  if (!bad) return [0.5, 0.5, 0.5, 0.5];

  return test.name === 'missed visible keypoint' ? [0, 0, 0.5, 0.5] : [0.5, 0.5, 0, 0];
}

function modelOutputs(test: EvidenceCase, label: number, bad: boolean) {
  const rows = detectionRows(test, label, bad);

  const outputs: Record<string, { dims: number[]; values: number[] }> = {
    detections: { dims: [1, rows.length / 6, 6], values: rows },
  };

  if (test.kind === 'classify') return { classes: { dims: [1, 2], values: bad ? [0.01, 0.99] : [0.99, 0.01] } };

  if (test.kind === 'segment') outputs.masks = { dims: [1, 1, 2, 2], values: bad ? [1, 0, 0, 0] : [1, 1, 1, 1] };

  if (test.kind === 'keypoints')
    outputs.keypoints = {
      dims: [1, 1, 2, 2],
      values: keypointValues(test, bad),
    };

  return outputs;
}

export async function evidenceModel(input: { test: EvidenceCase; label: number; bad: boolean; classes: string[] }) {
  const bytes =
    input.test.regression && input.bad
      ? inputSensitiveDetectionOnnx([0, 0, 1, 1, 0.01, input.label], [0, 0, 0, 0, 0.9, 0])
      : constantVisionOnnx(modelOutputs(input.test, input.label, input.bad));
  const hash = await datasetContentHash(bytes);
  const manifest: VisionManifest = {
    version: 1,
    id: `fixture-${hash.slice(0, 24)}`,
    kind: input.test.kind,
    adapter: 'generic',
    classes: input.classes,
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
    model: { source: 'local', sha256: hash, bytes: bytes.length },
  };

  return { bytes, manifest };
}
