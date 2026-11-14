import { describe, expect, it } from 'vitest';
import { decodeVision, type VisionOutputs } from './decode';
import { VISION_MODELS, type VisionModelManifest } from './manifest';
import { prepareFrame } from './preprocess';

const model = (kind: VisionModelManifest['kind']): VisionModelManifest => ({
  ...VISION_MODELS[0],
  kind,
  classes: ['person'],
  inputSize: [2, 2],
});
const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

describe('vision output kinds', () => {
  it('decodes keypoints into the same source-image coordinates as boxes', () => {
    const manifest = model('keypoints');
    const output = { dims: [1, 8, 1], data: new Float32Array([1, 1, 2, 2, 0.9, 0.5, 1.5, 0.8]) };
    const result = decodeVision({ output }, manifest, prepareFrame(frame, manifest).transform);

    expect(result.detections?.[0].keypoints?.[0]).toMatchObject({ x: 0.25, y: 0.75 });
    expect(result.detections?.[0].keypoints?.[0].score).toBeCloseTo(0.8);
  });

  it('decodes mask coefficients against prototypes and crops masks to their box', () => {
    const manifest = model('segment');
    const output = { dims: [1, 6, 1], data: new Float32Array([1, 1, 1, 2, 0.9, 1]) };
    const prototype = { dims: [1, 1, 2, 2], data: new Float32Array([10, -10, -10, 10]) };
    const result = decodeVision({ output, prototype }, manifest, prepareFrame(frame, manifest).transform);

    expect(Array.from(result.detections?.[0].mask?.values ?? [])).toEqual([1, 0, 0, 1]);
  });

  it('normalizes classification logits without overflow', () => {
    const manifest = { ...model('classify'), classes: ['person', 'cat'], adapter: 'classification' as const };
    const result = decodeVision(
      { output: { dims: [1, 2], data: new Float32Array([1001, 1000]) } },
      manifest,
      prepareFrame(frame, manifest).transform,
    );

    expect(result.classes?.[0].score).toBeCloseTo(0.731058);
    expect(result.classes?.[0].label).toBe('person');
  });

  it('matches YuNet stride, BGR input and five-landmark decoding', () => {
    const manifest = { ...VISION_MODELS[3], inputSize: [32, 32] as [number, number] };
    const outputs: VisionOutputs = {};

    for (const stride of [8, 16, 32]) {
      const count = (32 / stride) ** 2;

      for (const [name, channels] of [
        ['cls', 1],
        ['obj', 1],
        ['bbox', 4],
        ['kps', 10],
      ] as const)
        outputs[`${name}_${stride}`] = { dims: [1, count, channels], data: new Float32Array(count * channels) };
    }

    (outputs.cls_8.data as Float32Array)[5] = 0.81;
    (outputs.obj_8.data as Float32Array)[5] = 1;
    (outputs.bbox_8.data as Float32Array)[20] = 0.5;
    (outputs.bbox_8.data as Float32Array)[21] = 0.5;

    const result = decodeVision(outputs, manifest, prepareFrame(frame, manifest).transform);

    expect(result.detections?.[0].box).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(result.detections?.[0].score).toBeCloseTo(0.9);
    expect(result.detections?.[0].keypoints).toHaveLength(5);

    const prepared = prepareFrame(
      { width: 1, height: 1, data: new Uint8ClampedArray([255, 128, 0, 255]) },
      { ...manifest, inputSize: [1, 1] },
    );

    expect(Array.from(prepared.data)).toEqual([0, 128, 255]);
  });
});
