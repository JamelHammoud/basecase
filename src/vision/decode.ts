import type { VisionManifest } from './manifest';
import type { ImageTransform } from './preprocess';
import type { VisionDetection, VisionOutputs, VisionResult, VisionTensor } from './types';
import { decodeRfdetr, decodeYolo } from './decodeDetection';
import { decodeFace } from './decodeFace';
import { suppress } from './boxes';

interface SourceDetection {
  detection: VisionDetection;
  row: number;
}

interface GenericRows {
  detections: SourceDetection[];
  count: number;
}

const MAX_TENSOR_VALUES = 16777216;
const MAX_DETECTION_ROWS = 10000;
const MAX_MASK_DIMENSION = 2048;
const MAX_KEYPOINTS = 1024;

function tensorShape(tensor: VisionTensor | undefined, rank: number) {
  if (!tensor) throw new Error('The vision model returned unsupported tensors.');

  const dims = tensor.dims.length === rank + 1 && tensor.dims[0] === 1 ? tensor.dims.slice(1) : tensor.dims;
  const count = dims.reduce((size, dimension) => size * dimension, 1);

  if (
    dims.length !== rank ||
    !dims.every((dimension) => Number.isInteger(dimension) && dimension >= 0) ||
    !Number.isSafeInteger(count) ||
    count > MAX_TENSOR_VALUES ||
    count !== tensor.data.length
  )
    throw new Error('The vision model returned unsupported tensors.');

  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(Number(tensor.data[i]))) throw new Error('The vision model returned unsupported tensors.');
  }

  return { dims, tensor };
}

function genericDetections(outputs: VisionOutputs, manifest: VisionManifest): GenericRows {
  const { tensor, dims } = tensorShape(outputs.detections ?? Object.values(outputs)[0], 2);

  if (dims[1] !== 6 || dims[0] > MAX_DETECTION_ROWS)
    throw new Error('The detector needs rows of x, y, width, height, score and class.');

  const detections: SourceDetection[] = [];

  for (let i = 0; i < dims[0]; i++) {
    const row = Array.from({ length: 6 }, (_, n) => Number(tensor.data[i * 6 + n]));
    const label = manifest.classes[row[5]];

    if (label && row[4] >= 0.25)
      detections.push({ row: i, detection: { label, score: row[4], box: row.slice(0, 4) as VisionDetection['box'] } });
  }

  return { detections, count: dims[0] };
}

export function decode(
  outputs: VisionOutputs,
  manifest: VisionManifest,
  transform: ImageTransform,
): Pick<VisionResult, 'detections' | 'depth' | 'classes'> {
  if (manifest.kind === 'depth') return decodeDepth(outputs);

  if (manifest.kind === 'classify') return decodeClasses(outputs, manifest);

  if (manifest.adapter === 'rfdetr') return { detections: decodeRfdetr(outputs, manifest, transform) };

  if (manifest.adapter === 'yolo') return { detections: decodeYolo(outputs, manifest, transform) };

  if (manifest.adapter === 'yunet') return { detections: decodeFace(outputs, transform) };

  const detections = genericDetections(outputs, manifest);

  return { detections: suppress(withExtra(outputs, manifest, detections)) };
}

function decodeDepth(outputs: VisionOutputs) {
  const tensor = Object.values(outputs)[0];
  const width = Number(tensor?.dims.at(-1));
  const height = Number(tensor?.dims.at(-2));
  const values = Float32Array.from(tensor?.data ?? [], Number);

  if (!width || !height || width * height !== values.length || !values.every(Number.isFinite))
    throw new Error('The depth model returned unsupported tensors.');

  return { detections: [], depth: { values, width, height, relative: true as const } };
}

function decodeClasses(outputs: VisionOutputs, manifest: VisionManifest) {
  const { tensor, dims } = tensorShape(Object.values(outputs)[0], 1);

  if (dims[0] !== manifest.classes.length) throw new Error('The classifier returned unsupported tensors.');

  const classes = Array.from(tensor.data, (score, i) => ({ label: manifest.classes[i], score: Number(score) }));

  return { detections: [], classes: classes.sort((a, b) => b.score - a.score) };
}

function withExtra(outputs: VisionOutputs, manifest: VisionManifest, rows: GenericRows): VisionDetection[] {
  if (manifest.kind === 'segment') return withMasks(outputs.masks, rows);

  if (manifest.kind === 'keypoints') return withKeypoints(outputs.keypoints, rows);

  return rows.detections.map(({ detection }) => detection);
}

function withMasks(masks: VisionTensor | undefined, rows: GenericRows): VisionDetection[] {
  const { tensor, dims } = tensorShape(masks, 3);
  const [count, height, width] = dims;

  if (count !== rows.count || height < 1 || height > MAX_MASK_DIMENSION || width < 1 || width > MAX_MASK_DIMENSION)
    throw new Error('The segmenter returned unsupported masks.');

  return rows.detections.map(({ detection, row }) => {
    const values = new Uint8Array(width * height);

    for (let i = 0; i < values.length; i++) values[i] = Number(tensor.data[row * values.length + i]) > 0.5 ? 1 : 0;

    return { ...detection, mask: { width, height, values } };
  });
}

function withKeypoints(points: VisionTensor | undefined, rows: GenericRows): VisionDetection[] {
  const { tensor, dims } = tensorShape(points, 3);
  const [count, landmarks, coordinates] = dims;

  if (count !== rows.count || landmarks < 1 || landmarks > MAX_KEYPOINTS || coordinates !== 2)
    throw new Error('The keypoint model returned unsupported landmarks.');

  return rows.detections.map(({ detection, row }) => {
    const keypoints: [number, number][] = Array.from({ length: landmarks }, (_, p) => [
      Number(tensor.data[(row * landmarks + p) * 2]),
      Number(tensor.data[(row * landmarks + p) * 2 + 1]),
    ]);

    return { ...detection, keypoints };
  });
}
