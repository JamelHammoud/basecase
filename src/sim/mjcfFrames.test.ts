import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { simDelta, simDeltas, worldDelta, worldDeltas } from './mjcfFrames';
import { SIM_MODEL_VERSION, type SimBody, type SimModel } from './mjcfTypes';

const modelOf = (bodies: SimBody[]): SimModel => ({
  version: SIM_MODEL_VERSION,
  xml: '',
  bodies,
  joints: [],
  robots: [],
  initial: { values: {} },
  massKg: {},
});

function posesOf(model: SimModel, phase = 0) {
  return Float64Array.from(
    model.bodies.flatMap((_, i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.17 + phase, i * -0.11, phase - 0.3));

      return [i * 0.13 + phase, -i * 0.23 - phase, i * 0.31, q.w, q.x, q.y, q.z];
    }),
  );
}

function referenceDeltas(model: SimModel, poses: Float64Array, kind: 'parts' | 'world') {
  const out = new Map<string, THREE.Matrix4>();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  model.bodies.forEach((body, i) => {
    const ids = body[kind];

    if (!ids?.length) return;

    const o = i * 7;
    const p = [poses[o] * 1000, poses[o + 2] * 1000, -poses[o + 1] * 1000];

    q.set(poses[o + 4], poses[o + 6], -poses[o + 5], poses[o + 3]);
    m.makeRotationFromQuaternion(q);

    const r = new THREE.Vector3(...body.origin).applyQuaternion(q);

    m.setPosition(p[0] - r.x, p[1] - r.y, p[2] - r.z);

    for (const id of ids) out.set(id, m.clone());
  });

  return out;
}

const kinds = [
  { kind: 'parts', one: simDelta, all: simDeltas },
  { kind: 'world', one: worldDelta, all: worldDeltas },
] as const;

function mixedModel() {
  return modelOf([
    { name: 'empty', parts: [], origin: [0, 0, 0] },
    { name: 'base', parts: ['base', 'sensor', 'same', 'crossed'], origin: [13.1, -24.5, 39] },
    { name: 'hand', parts: ['finger', 'tip', 'tip'], origin: [-40, 100, 75] },
    { name: 'crate', parts: [], world: ['crate', 'same', 'crossed'], origin: [0, -37, 200] },
    { name: 'shared', parts: ['same'], world: ['target', 'same'], origin: [-11, 29, -57] },
  ]);
}

describe('single simulation body transforms', () => {
  it('matches full maps exactly across rotated frames, aliases, duplicates and both namespaces', () => {
    const model = mixedModel();
    const before = structuredClone(model);

    for (const phase of [0, 0.73, -1.4]) {
      const poses = posesOf(model, phase);
      const poseBefore = poses.slice();

      for (const { kind, one, all } of kinds) {
        const expected = referenceDeltas(model, poses, kind);

        expect(all(model, poses)).toEqual(expected);

        for (const id of ['base', 'sensor', 'finger', 'tip', 'crate', 'target', 'same', 'crossed', 'missing', '']) {
          expect(one(model, poses, id)).toEqual(expected.get(id));
        }
      }

      expect(poses).toEqual(poseBefore);
    }

    expect(model).toEqual(before);
  });

  it.each(kinds)('reads current poses, origins and $kind membership without sharing results', ({ kind, one }) => {
    const model = mixedModel();
    const poses = posesOf(model);
    const first = one(model, poses, 'same')!;
    const saved = first.clone();
    const second = one(model, poses, 'same')!;

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    second.elements[12] += 50;
    poses[model.bodies.length * 7 - 7] += 0.04;
    model.bodies.at(-1)!.origin[2] -= 37;

    expect(one(model, poses, 'same')).toEqual(referenceDeltas(model, poses, kind).get('same'));
    expect(one(model, poses, 'same')).not.toEqual(first);

    model.bodies.at(-1)![kind] = [];

    expect(one(model, poses, 'same')).toEqual(referenceDeltas(model, poses, kind).get('same'));
    expect(first).toEqual(saved);

    const replacement = mixedModel();

    expect(one(replacement, posesOf(replacement), 'same')).toEqual(saved);
  });

  it.each(kinds)('preserves nonfinite and short pose results for $kind', ({ kind, one, all }) => {
    const model = mixedModel();

    for (const poses of [new Float64Array(), posesOf(model), posesOf(model, Number.NaN)]) {
      poses[7] = Number.POSITIVE_INFINITY;
      poses[21] = Number.NEGATIVE_INFINITY;

      const expected = referenceDeltas(model, poses, kind);

      expect(all(model, poses)).toEqual(expected);

      for (const id of expected.keys()) expect(one(model, poses, id)).toEqual(expected.get(id));
    }
  });

  it('returns no transform for absent ids or empty models without reading poses', () => {
    const rotation = vi.spyOn(THREE.Matrix4.prototype, 'makeRotationFromQuaternion');

    try {
      for (const { one } of kinds) {
        expect(one(modelOf([]), new Float64Array(), 'same')).toBeUndefined();
        expect(one(mixedModel(), new Float64Array(), 'missing')).toBeUndefined();
      }

      expect(rotation).not.toHaveBeenCalled();
    } finally {
      rotation.mockRestore();
    }
  });

  it.each([300, 600])('transforms only requested bodies in a %i-body model', (count) => {
    const model = modelOf(
      Array.from({ length: count }, (_, i) => ({
        name: `body-${i}`,
        parts: [`part-${i}`, `alias-${i}`],
        world: [`world-${i}`],
        origin: [i, i * -2, i * 3],
      })),
    );
    const poses = posesOf(model);
    const rotation = vi.spyOn(THREE.Matrix4.prototype, 'makeRotationFromQuaternion');
    const clone = vi.spyOn(THREE.Matrix4.prototype, 'clone');
    const expected: Array<THREE.Matrix4 | undefined> = [];

    try {
      for (let i = 0; i < 10; i++) {
        expected.push(simDeltas(model, poses).get(`part-${i}`));
        expected.push(worldDeltas(model, poses).get(`world-${count - i - 1}`));
      }

      expect(rotation).toHaveBeenCalledTimes(count * 20);
      expect(clone).toHaveBeenCalledTimes(count * 30);
      rotation.mockClear();
      clone.mockClear();

      const actual: Array<THREE.Matrix4 | undefined> = [];

      for (let i = 0; i < 10; i++) {
        actual.push(simDelta(model, poses, `part-${i}`));
        actual.push(worldDelta(model, poses, `world-${count - i - 1}`));
      }

      expect(actual).toEqual(expected);
      expect(rotation).toHaveBeenCalledTimes(20);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      rotation.mockRestore();
      clone.mockRestore();
    }
  });
});
