import { describe, expect, it } from 'vitest';
import { clamp01, imageBox, suppress } from './boxes';
import { decodeFace } from './decodeFace';
import type { ImageTransform } from './preprocess';
import type { VisionDetection, VisionOutputs } from './types';
import { tensorShape } from './tensorShape';

const transform = { width: 320, height: 320, scaledWidth: 240, scaledHeight: 280, left: 40, top: 20 };

function outputsFor(size: number, seed: number): VisionOutputs {
  const outputs: VisionOutputs = {};

  for (const stride of [8, 16, 32]) {
    const count = (size / stride) ** 2;
    const cls = Array.from({ length: count }, (_, row) => [0, 0.36, 0.64, 1][(row + seed) % 4]);
    const obj = Array.from({ length: count }, (_, row) => [1, 0.81, 1][(row + seed) % 3]);
    const bbox = Array.from({ length: count }, (_, row) => [
      size / stride / 2 - (row % (size / stride)),
      size / stride / 2 - Math.floor(row / (size / stride)),
      Math.log((size * 2) / stride),
      Math.log((size * 2) / stride),
    ]).flat();
    const kps = Array.from({ length: count * 10 }, (_, value) => ((value * 13 + seed) % 71) - 35);

    outputs[`cls_${stride}`] = { data: cls, dims: [1, count, 1] };
    outputs[`obj_${stride}`] = { data: obj, dims: [count, 1] };
    outputs[`bbox_${stride}`] = { data: bbox, dims: [1, count, 4] };
    outputs[`kps_${stride}`] = { data: kps, dims: [count, 10] };
  }

  return outputs;
}

function eagerFace(outputs: VisionOutputs, view: ImageTransform) {
  const result: VisionDetection[] = [];

  for (const stride of [8, 16, 32]) {
    const count = (view.width / stride) * (view.height / stride);

    for (let index = 0; index < count; index++) {
      const cls = Number(outputs[`cls_${stride}`].data[index]);
      const obj = Number(outputs[`obj_${stride}`].data[index]);
      const score = Math.sqrt(clamp01(cls) * clamp01(obj));

      if (score < 0.6) continue;

      result.push(eagerFaceRow({ outputs, view, stride, index, score }));
    }
  }

  return suppress(result, 0.3);
}

function eagerFaceRow(input: {
  outputs: VisionOutputs;
  view: ImageTransform;
  stride: number;
  index: number;
  score: number;
}) {
  const { outputs, view, stride, index, score } = input;
  const bbox = outputs[`bbox_${stride}`];
  const kps = outputs[`kps_${stride}`];
  const x = index % (view.width / stride);
  const y = Math.floor(index / (view.width / stride));
  const cx = (x + Number(bbox.data[index * 4])) * stride;
  const cy = (y + Number(bbox.data[index * 4 + 1])) * stride;
  const w = Math.exp(Number(bbox.data[index * 4 + 2])) * stride;
  const h = Math.exp(Number(bbox.data[index * 4 + 3])) * stride;
  const keypoints: [number, number][] = Array.from({ length: 5 }, (_, point) => [
    clamp01(((x + Number(kps.data[index * 10 + point * 2])) * stride - view.left) / view.scaledWidth),
    clamp01(((y + Number(kps.data[index * 10 + point * 2 + 1])) * stride - view.top) / view.scaledHeight),
  ]);

  return { label: 'face', score, box: imageBox([cx - w / 2, cy - h / 2, w, h], view), keypoints };
}

function observeLandmarks(outputs: VisionOutputs) {
  let reads = 0;

  for (const stride of [8, 16, 32]) {
    const source = outputs[`kps_${stride}`];

    source.data = new Proxy(source.data, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads++;

        return Reflect.get(target, property, receiver);
      },
    });
  }

  return () => reads;
}

describe('retained YuNet face landmarks', () => {
  it('matches eager landmarks across strides, score ties, clipping and letterbox transforms', () => {
    const view = { ...transform, width: 64, height: 64 };

    for (let seed = 0; seed < 80; seed++) {
      const outputs = outputsFor(64, seed);
      const boxes = outputs.bbox_8.data as number[];

      for (let row = 0; row < 64; row++) {
        boxes[row * 4] = (row + seed) % 3;
        boxes[row * 4 + 1] = (row * seed) % 3;
        boxes[row * 4 + 2] = (row % 4) / 5;
        boxes[row * 4 + 3] = (seed % 4) / 5;
      }

      const before = structuredClone(outputs);

      expect(decodeFace(outputs, view)).toEqual(eagerFace(outputs, view));
      expect(outputs).toEqual(before);
    }
  });

  it.each([300, 600])('decodes one face after validating all landmarks with %i overlapping candidates', (count) => {
    const outputs = outputsFor(320, 0);

    for (const stride of [8, 16, 32]) {
      (outputs[`cls_${stride}`].data as number[]).fill(0);
      (outputs[`obj_${stride}`].data as number[]).fill(1);
    }

    (outputs.cls_8.data as number[]).fill(1, 0, count);

    const previous = structuredClone(outputs);
    const previousReads = observeLandmarks(previous);

    for (const stride of [8, 16, 32]) tensorShape(previous[`kps_${stride}`], 2);

    const expected = eagerFace(previous, transform);

    expect(previousReads()).toBe(21000 + count * 10);

    const reads = observeLandmarks(outputs);
    const result = decodeFace(outputs, transform);

    expect(result).toEqual(expected);
    expect(result).toHaveLength(1);
    expect(reads()).toBe(21000 + 10);
  });

  it('validates suppressed landmarks and overflowed boxes before returning retained faces', () => {
    const view = { ...transform, width: 64, height: 64 };
    const outputs = outputsFor(64, 0);

    (outputs.kps_32.data as number[])[39] = NaN;

    expect(() => decodeFace(outputs, view)).toThrow('The vision model returned unsupported tensors.');

    (outputs.kps_32.data as number[])[39] = 0;
    (outputs.cls_32.data as number[])[3] = 1;
    (outputs.obj_32.data as number[])[3] = 1;
    (outputs.bbox_32.data as number[])[14] = 1000;

    expect(() => decodeFace(outputs, view)).toThrow('The face detector returned unsupported tensors.');
  });

  it('keeps the global cap and source landmarks for separate faces with later high scores', () => {
    const outputs = outputsFor(320, 0);
    const view = { ...transform, scaledWidth: 320, scaledHeight: 320, left: 0, top: 0 };

    for (const stride of [8, 16, 32]) {
      (outputs[`cls_${stride}`].data as number[]).fill(0);
      (outputs[`obj_${stride}`].data as number[]).fill(1);
      (outputs[`bbox_${stride}`].data as number[]).fill(0);
    }

    const scores = outputs.cls_8.data as number[];

    for (let row = 0; row < 600; row++) scores[row] = row % 2 ? 1 : 0.64;

    const actual = decodeFace(outputs, view);

    expect(actual).toEqual(eagerFace(outputs, view));
    expect(actual).toHaveLength(300);
    expect(actual.every((face) => face.score === 1)).toBe(true);
  });

  it('keeps independent results across edits and handles frozen and empty inputs', () => {
    const view = { ...transform, width: 64, height: 64 };
    const outputs = outputsFor(64, 0);
    const first = decodeFace(outputs, view);
    const saved = structuredClone(first);

    (outputs.kps_8.data as number[]).fill(5);

    const second = decodeFace(outputs, view);

    expect(first).toEqual(saved);
    expect(second).toEqual(eagerFace(outputs, view));
    expect(second[0].keypoints).not.toBe(first[0].keypoints);

    for (const output of Object.values(outputs)) {
      Object.freeze(output.data);
      Object.freeze(output.dims);
      Object.freeze(output);
    }

    expect(decodeFace(Object.freeze(outputs), view)).toEqual(second);

    const empty = outputsFor(64, 0);

    for (const stride of [8, 16, 32]) (empty[`cls_${stride}`].data as number[]).fill(0);

    expect(decodeFace(empty, view)).toEqual([]);
  });
});
