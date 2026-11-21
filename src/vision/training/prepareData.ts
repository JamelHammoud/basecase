import type { DatasetSnapshot } from '../../datasets/snapshotTypes';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { frameHash, type FrameSet, type ImageAnnotation, type ImageClass, type TrainingFrame } from '../frameSet';
import type { VisionKind } from '../manifest';
import type { PreparationSource } from './prepareSources';
import { prepareSplits, type VisionAssignment } from './prepareSplits';
import { evaluationImageGroups } from '../conditions';

export type VisionTrainingKind = Exclude<VisionKind, 'depth'>;

export interface PreparationInput {
  snapshot: DatasetSnapshot;
  sets: FrameSet[];
  provenance: PreparationSource[];
  seed: number;
  frozen: boolean;
  kind: VisionTrainingKind;
}

export function preparationTransfer(sets: FrameSet[]) {
  return [
    ...new Set(sets.flatMap((set) => set.frames.flatMap((frame) => [frame.jpeg.buffer, frame.depth.buffer]))),
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

function reviewed(annotation: ImageAnnotation) {
  return (
    annotation.review !== 'suggested' &&
    (!annotation.source || annotation.source === 'manual' || annotation.review === 'accepted')
  );
}

function checkLabels(frame: TrainingFrame, kind: VisionTrainingKind) {
  if (!frame.annotations.every(reviewed)) throw new Error('Accept the image labels before training.');

  if (kind === 'classify' && frame.annotations.length !== 1)
    throw new Error('Choose one annotation for each classification image.');

  if (
    kind === 'keypoints' &&
    frame.annotations.some((annotation) => !annotation.keypoints.some((point) => point.visible))
  )
    throw new Error('Add visible keypoints to each image label.');
}

function mergeClasses(sets: FrameSet[]) {
  const byName = new Map<string, ImageClass>();

  for (const category of sets.flatMap((set) => set.classes)) {
    const existing = byName.get(category.name);
    const keypoints = [...new Set([...(existing?.keypoints ?? []), ...(category.keypoints ?? [])])].sort();

    byName.set(category.name, {
      id: existing?.id ?? byName.size,
      name: category.name,
      ...(keypoints.length ? { keypoints } : {}),
    });
  }

  return [...byName.keys()].sort().map((name, id) => ({ ...byName.get(name)!, id }));
}

function trainingSets(sets: FrameSet[], classes: ImageClass[], samples: FrozenImageSample[]) {
  const ids = new Map(classes.map((category) => [category.name, category.id]));
  const splits = new Map(samples.map((sample) => [`${sample.frameSetId}/${sample.frameId}`, sample.split]));

  return sets.map((set) => {
    const localIds = new Map(set.classes.map((category) => [category.id, ids.get(category.name)!]));

    return {
      ...set,
      classes,
      splits: Object.fromEntries(set.frames.map((frame) => [frame.id, splits.get(`${set.id}/${frame.id}`)!])),
      frames: set.frames.map((frame) => ({
        ...frame,
        annotations: frame.annotations.map((annotation) => ({
          ...annotation,
          classId: localIds.get(annotation.classId)!,
        })),
      })),
    };
  });
}

async function jpegHash(jpeg: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(jpeg));

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sourceAssignment(sample: FrozenImageSample, sources: Map<string, PreparationSource>, frozen: boolean) {
  const origin = sources.get(sample.source);

  if (origin?.explicit && sample.explicit && origin.explicit !== sample.explicit)
    throw new Error('The same source has conflicting dataset splits.');

  return {
    source: origin?.root ?? sample.source,
    explicit: frozen ? sample.split : (sample.explicit ?? origin?.explicit),
    real: origin?.real ?? false,
    imageSource: sample.source,
  };
}

export async function prepareTrainingData(input: PreparationInput) {
  const { sets, snapshot, provenance, frozen, kind } = input;
  const frames = new Map(sets.flatMap((set) => set.frames.map((frame) => [`${set.id}/${frame.id}`, frame] as const)));
  const sources = new Map(provenance.map((source) => [source.source, source]));
  const assignments: VisionAssignment[] = [];

  if (!snapshot.images.length) throw new Error('Add labeled images to the dataset.');

  for (const sample of snapshot.images) {
    const frame = frames.get(`${sample.frameSetId}/${sample.frameId}`);

    if (!frame || (await frameHash(frame)) !== sample.hash) throw new Error('The frozen image content changed.');

    checkLabels(frame, kind);
    assignments.push({ ...sourceAssignment(sample, sources, frozen), content: await jpegHash(frame.jpeg) });
  }

  const { splits, realSourceIds } = prepareSplits(assignments, input.seed, frozen);
  const samples = snapshot.images.map((sample, index) => ({ ...sample, split: splits[index] }));
  const classes = mergeClasses(sets);
  const real = new Set(realSourceIds);

  if (kind === 'classify' && classes.length < 2) throw new Error('Classification training needs at least two classes.');

  if (!classes.length || !sets.some((set) => set.frames.some((frame) => frame.annotations.length)))
    throw new Error('Add image labels before training.');

  return {
    snapshot: { ...snapshot, images: samples },
    samples,
    evaluationSamples: evaluationImageGroups(samples, sets),
    classes,
    sets,
    trainingSets: trainingSets(sets, classes, samples),
    provenance,
    realSourceIds,
    realSources: [...new Set(provenance.filter((source) => real.has(source.source)).map((source) => source.root))],
    realTestSources: [
      ...new Set(
        samples.filter((sample) => sample.split === 'test' && real.has(sample.source)).map((sample) => sample.source),
      ),
    ],
  };
}
