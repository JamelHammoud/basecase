import { describe, expect, it } from 'vitest';
import { suppress } from './boxes';
import { visionModel } from './catalogue';
import { decode } from './decode';
import type { VisionKind, VisionManifest } from './manifest';
import type { VisionDetection, VisionOutputs, VisionTensor } from './types';
import { tensorShape } from './tensorShape';

const transform = { width: 64, height: 32, scaledWidth: 48, scaledHeight: 32, left: 8, top: 0 };
const manifest = (kind: VisionKind): VisionManifest => ({
  ...visionModel('yolo11n')!,
  adapter: 'generic',
  classes: ['person', 'cat', '', '__proto__'],
  kind,
});
const tensor = (data: number[], dims: number[]): VisionTensor => ({ data, dims });

function eagerExtras(outputs: VisionOutputs, model: VisionManifest) {
  const count = outputs.detections.data.length / 6;
  const result: VisionDetection[] = [];

  for (let row = 0; row < count; row++) {
    const values = Array.from({ length: 6 }, (_, column) => Number(outputs.detections.data[row * 6 + column]));
    const label = model.classes[values[5]];

    if (!label || values[4] < 0.25) continue;

    const detection: VisionDetection = { label, score: values[4], box: values.slice(0, 4) as VisionDetection['box'] };

    if (model.kind === 'segment') detection.mask = eagerMask(outputs.masks, row);

    if (model.kind === 'keypoints') {
      const landmarks = outputs.keypoints.dims.at(-2)!;

      detection.keypoints = Array.from({ length: landmarks }, (_, point) => [
        Number(outputs.keypoints.data[(row * landmarks + point) * 2]),
        Number(outputs.keypoints.data[(row * landmarks + point) * 2 + 1]),
      ]);
    }

    result.push(detection);
  }

  return suppress(result);
}

function eagerMask(source: VisionTensor, row: number) {
  const width = source.dims.at(-1)!;
  const height = source.dims.at(-2)!;
  const values = Uint8Array.from({ length: width * height }, (_, pixel) =>
    Number(Number(source.data[row * width * height + pixel]) > 0.5),
  );

  return { width, height, values };
}

function fixture(seed: number, count = 32): VisionOutputs {
  const rows = Array.from({ length: count }, (_, row) => [
    ((row + seed) % 4) / 8,
    ((row * seed) % 3) / 8,
    row % 7 === 0 ? 0 : 0.5,
    row % 11 === 0 ? -0.25 : 0.5,
    [0.1, 0.25, 0.5, 0.5, 0.9][(row + seed) % 5],
    (row + seed) % 5,
  ]).flat();
  const masks = Array.from({ length: count * 12 }, (_, pixel) => ((pixel * 7 + seed) % 13) / 12);
  const keypoints = Array.from({ length: count * 10 }, (_, coordinate) => (coordinate + seed) / 9);
  const batch = seed % 2 ? [1] : [];

  return {
    detections: tensor(rows, [...batch, count, 6]),
    masks: tensor(masks, [...batch, count, 3, 4]),
    keypoints: tensor(keypoints, [...batch, count, 5, 2]),
  };
}

function watched(source: VisionTensor) {
  let reads = 0;
  const data = new Proxy(source.data, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads++;

      return Reflect.get(target, property, receiver);
    },
  });

  return { tensor: { ...source, data }, reads: () => reads };
}

const identicalRows = (count: number) =>
  tensor(Array.from({ length: count }, () => [0, 0, 1, 1, 0.9, 0]).flat(), [count, 6]);

function assertRejectedExtras(source: VisionOutputs) {
  for (const [kind, name] of [
    ['segment', 'masks'],
    ['keypoints', 'keypoints'],
  ] as const) {
    const values = Array.from(source[name].data, Number);

    values[values.length - 1] = Infinity;

    expect(() => decode({ ...source, [name]: { ...source[name], data: values } }, manifest(kind), transform)).toThrow(
      'The vision model returned unsupported tensors.',
    );
  }
}

describe('retained detection extras', () => {
  it('matches eager decoding across overlaps, thresholds, score ties, classes and batched shapes', () => {
    for (let seed = 0; seed < 80; seed++) {
      const outputs = fixture(seed);
      const before = structuredClone(outputs);

      for (const kind of ['detect', 'segment', 'keypoints'] as const) {
        const model = manifest(kind);

        expect(decode(outputs, model, transform)).toEqual({ detections: eagerExtras(outputs, model) });
      }

      expect(outputs).toEqual(before);
    }
  });

  it('preserves capped order and original rows beyond the first 300 candidates', () => {
    const outputs = fixture(1, 620);
    const data = outputs.detections.data as number[];

    for (let row = 0; row < 620; row++) {
      data[row * 6 + 4] = row % 2 ? 0.9 : 0.5;
      data[row * 6 + 5] = row;
    }

    for (const kind of ['segment', 'keypoints'] as const) {
      const model = { ...manifest(kind), classes: Array.from({ length: 620 }, (_, row) => `class-${row}`) };
      const expected = eagerExtras(outputs, model);
      const actual = decode(outputs, model, transform).detections;

      expect(actual).toEqual(expected);
      expect(actual).toHaveLength(300);
      expect(actual[299].label).toBe('class-599');
    }
  });

  it('preserves bigint values and typed-array views', () => {
    const source: VisionOutputs = {
      detections: { data: new BigInt64Array([0n, 0n, 1n, 1n, 1n, 0n]), dims: [1, 6] },
      masks: { data: new Float32Array([99, 0, 1, 99]).subarray(1, 3), dims: [1, 1, 2] },
      keypoints: { data: new BigInt64Array([99n, 0n, 1n, 99n]).subarray(1, 3), dims: [1, 1, 2] },
    };

    for (const kind of ['segment', 'keypoints'] as const)
      expect(decode(source, manifest(kind), transform)).toEqual({ detections: eagerExtras(source, manifest(kind)) });
  });

  it('keeps validation for suppressed rows, cap-discarded rows and empty results', () => {
    const source = fixture(0, 620);

    source.detections = identicalRows(620);
    assertRejectedExtras(source);

    const unique = {
      ...source,
      detections: tensor(Array.from({ length: 620 }, (_, row) => [row * 2, 0, 1, 1, 0.9, 0]).flat(), [620, 6]),
    };

    assertRejectedExtras(unique);

    const empty = fixture(0, 0);

    expect(decode(empty, manifest('segment'), transform)).toEqual({ detections: [] });
    expect(decode(empty, manifest('keypoints'), transform)).toEqual({ detections: [] });
    expect(() => decode({ ...empty, masks: tensor([], [0, 0, 1]) }, manifest('segment'), transform)).toThrow();
    expect(() => decode({ ...empty, keypoints: tensor([], [0, 1025, 2]) }, manifest('keypoints'), transform)).toThrow();
  });

  it('returns independent extras after source edits and leaves frozen inputs untouched', () => {
    const source = fixture(3);
    const model = manifest('segment');
    const before = decode(source, model, transform);
    const saved = structuredClone(before);

    (source.masks.data as number[]).fill(1);

    const after = decode(source, model, transform);

    expect(before).toEqual(saved);
    expect(after.detections[0].mask?.values).not.toBe(before.detections[0].mask?.values);
    expect(after).toEqual({ detections: eagerExtras(source, model) });

    for (const value of Object.values(source)) {
      Object.freeze(value.data);
      Object.freeze(value.dims);
      Object.freeze(value);
    }

    expect(decode(Object.freeze(source), model, transform)).toEqual(after);
  });

  it.each([300, 600])('reads extras only for the retained row after validating %i candidates', (count) => {
    for (const [kind, name] of [
      ['segment', 'masks'],
      ['keypoints', 'keypoints'],
    ] as const) {
      const outputs = fixture(0, count);
      const previous = watched(outputs[name]);
      const observed = watched(outputs[name]);
      const valuesPerRow = outputs[name].data.length / count;

      outputs.detections = identicalRows(count);
      outputs[name] = previous.tensor;
      tensorShape(previous.tensor, 3);

      const expected = eagerExtras(outputs, manifest(kind));

      expect(previous.reads()).toBe(count * valuesPerRow * 2);

      outputs[name] = observed.tensor;

      const actual = decode(outputs, manifest(kind), transform);

      expect(actual.detections).toHaveLength(1);
      expect(observed.reads()).toBe((count + 1) * valuesPerRow);
      expect(actual).toEqual({ detections: expected });
    }
  });
});
