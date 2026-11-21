import { unpackImageSnapshot } from '../imageSnapshot';
import type { FrameSet, ImageAnnotation, TrainingFrame } from '../frameSet';
import { labelGeometry, type LabelGeometry } from '../labelEdits';
import { detectionPixels } from '../prelabelsGeometry';
import type { VisionDetection, VisionResult } from '../types';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { decodeEvidenceResult } from './evidence';
import type { EvidencePrediction } from './evidenceTypes';
import type { TrainingTask } from './types';

export interface InspectionImageInput {
  sample: FrozenImageSample;
  bytes: Uint8Array;
  candidate: EvidencePrediction;
  incumbent: EvidencePrediction;
  task: TrainingTask;
}

function maskLabels(input: LabelGeometry): ImageAnnotation[] {
  if (!input.pixels?.some(Boolean)) return [];

  return [labelGeometry(input)];
}

function detectionLabel(input: {
  detection: VisionDetection;
  frame: TrainingFrame;
  task: TrainingTask;
  index: number;
}): ImageAnnotation[] {
  const { detection, frame, task, index } = input;
  const category = task.classes.find((entry) => entry.name === detection.label)!;
  const names = [...new Set(task.classes.flatMap((entry) => entry.keypoints ?? []))];
  const keypoints = (task.kind === 'keypoints' ? (detection.keypoints ?? []) : []).flatMap(([x, y], at) => {
    if (!names[at] || !category.keypoints?.includes(names[at])) return [];

    return [{ name: names[at], x: x * frame.width, y: y * frame.height, visible: true }];
  });
  const instance = `prediction-${index}`;

  if (task.kind === 'segment')
    return maskLabels({
      width: frame.width,
      height: frame.height,
      instance,
      classId: category.id,
      pixels: detectionPixels(detection, frame.width, frame.height),
      keypoints,
    });

  const [x, y, width, height] = detection.box.map((value, at) => value * (at % 2 === 0 ? frame.width : frame.height));

  return [
    {
      instance,
      classId: category.id,
      box: [x, y, width, height],
      mask: { size: [frame.height, frame.width], counts: [frame.width * frame.height] },
      polygons: [[x, y, x + width, y, x + width, y + height, x, y + height]],
      keypoints,
    },
  ];
}

function predictionLabels(result: VisionResult, frame: TrainingFrame, task: TrainingTask) {
  if (task.kind === 'classify') return [];

  return result.detections.flatMap((detection, index) => {
    if (task.kind === 'segment' && !detection.mask) return [];

    return detectionLabel({ detection, frame, task, index });
  });
}

export async function inspectionImage(input: InspectionImageInput) {
  const set = await unpackImageSnapshot(input.sample, input.bytes);
  const frame = set.frames[0];
  const candidate = decodeEvidenceResult(input.candidate);
  const incumbent = decodeEvidenceResult(input.incumbent);

  if ([candidate, incumbent].some((result) => result.width !== frame.width || result.height !== frame.height))
    throw new Error('The saved prediction dimensions changed.');

  const groundTruth = frame.annotations.map((annotation) => {
    const original = set.classes.find((entry) => entry.id === annotation.classId);
    const category = input.task.classes.find((entry) => entry.name === original?.name);

    if (!category) throw new Error('The frozen image classes changed.');

    const [x, y, width, height] = annotation.box;
    const polygons =
      input.task.kind === 'segment'
        ? annotation.polygons
        : [[x, y, x + width, y, x + width, y + height, x, y + height]];

    return {
      ...annotation,
      polygons,
      classId: category.id,
      keypoints: input.task.kind === 'keypoints' ? annotation.keypoints : [],
    };
  });

  return {
    set: { ...set, classes: input.task.classes, frames: [{ ...frame, annotations: groundTruth }] } as FrameSet,
    originalClasses: set.classes,
    candidate: predictionLabels(candidate, frame, input.task),
    incumbent: predictionLabels(incumbent, frame, input.task),
    candidateClasses: candidate.classes ?? [],
    incumbentClasses: incumbent.classes ?? [],
  };
}
