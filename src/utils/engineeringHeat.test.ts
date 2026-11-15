import { expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import type { MeshMeasure } from '../three/meshMeasure';
import { isPrinted } from './bom';
import { box, component, part, row, run, type Measures, type V3 } from './engineering.fixtures';
import { servoTouchPairs } from './engineeringHeat';
import { drivesJoint } from './powerSources';
import { seededRandom } from './seededRandom';

function referencePairs(
  parts: ScenePart[],
  measures: Record<string, MeshMeasure | undefined>,
): Array<[string, string]> {
  const servos = parts.filter(drivesJoint).filter((servo) => measures[servo.id]);

  return parts.filter(isPrinted).flatMap((printed) => {
    const m = measures[printed.id];

    return m
      ? servos
          .filter((servo) => {
            const n = measures[servo.id]!;

            return [0, 1, 2].every((axis) => m.min[axis] <= n.max[axis] + 1 && n.min[axis] <= m.max[axis] + 1);
          })
          .map((servo): [string, string] => [printed.id, servo.id])
      : [];
  });
}

function mixedScene(seed: number) {
  const random = seededRandom(seed.toString(16).padStart(32, '0'));
  const parts = Array.from({ length: 36 }, (_, index) => {
    const id = `part-${index}`;

    if (index % 3 === 0) return component(id, 'feetech-sts3215');

    if (index % 3 === 1) return component(id, 'raspberry-pi-5');

    return part(id, { role: index % 5 === 0 ? 'cutout' : 'solid' });
  });
  const measures: Measures = {};

  for (const [index, p] of parts.entries()) {
    if (index % 7 === 0) continue;

    const min = [0, 1, 2].map(() => random() * 30 - 15) as V3;
    const max = min.map((value) => value + random() * 10) as V3;

    measures[p.id] = box(min, max);
  }

  return { parts, measures };
}

it('matches complete contact candidates across mixed scenes, ordering and edited bounds', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const scene = mixedScene(seed);
    const snapshot = structuredClone(scene);
    const first = servoTouchPairs(scene.parts, scene.measures);

    expect(first).toEqual(referencePairs(scene.parts, scene.measures));
    expect(scene).toEqual(snapshot);

    scene.parts.reverse();
    scene.measures['part-3'] = box([-100, -100, -100], [100, 100, 100]);
    scene.measures['part-14'] = box([0, 0, 0], [10, 10, 10]);
    delete scene.measures['part-6'];

    expect(servoTouchPairs(scene.parts, scene.measures)).toEqual(referencePairs(scene.parts, scene.measures));
    expect(first).toEqual(referencePairs(snapshot.parts, snapshot.measures));
  }
});

it('keeps the inclusive one-millimeter boundary on every axis and both sides', () => {
  const parts = [part('printed'), component('servo', 'feetech-sts3215')];
  const printed = box([0, 0, 0], [10, 10, 10]);

  for (const axis of [0, 1, 2]) {
    for (const side of [-1, 1]) {
      for (const gap of [0, 1 - 1e-10, 1, 1 + 1e-10]) {
        const min: V3 = [0, 0, 0];
        const max: V3 = [10, 10, 10];
        const shift = side * (10 + gap);

        min[axis] += shift;
        max[axis] += shift;

        expect(servoTouchPairs(parts, { printed, servo: box(min, max) })).toEqual(
          gap <= 1 ? [['printed', 'servo']] : [],
        );
      }
    }
  }
});

it('reads each measured servo once rather than once per printed candidate', () => {
  for (const count of [300, 600]) {
    const printed = Array.from({ length: count }, (_, i) => part(`printed-${i}`));
    const servos = Array.from({ length: 20 }, (_, i) => component(`servo-${i}`, 'feetech-sts3215'));
    const parts = [...printed, ...servos];
    const measure = box([0, 0, 0], [10, 10, 10]);
    let reads = 0;
    const measures = new Proxy(Object.fromEntries(parts.map((p) => [p.id, measure])), {
      get(target, key: string) {
        reads++;

        return target[key];
      },
    });
    const pairs = servoTouchPairs(parts, measures);

    expect(pairs).toHaveLength(count * servos.length);
    expect(pairs[0]).toEqual(['printed-0', 'servo-0']);
    expect(pairs.at(-1)).toEqual([`printed-${count - 1}`, 'servo-19']);
    expect(reads).toBe(parts.length);
  }
});

it('keeps the fallback shell clearance strict on every axis and uses measured contacts when supplied', () => {
  const parts = [part('printed', { printMaterial: 'PLA' }), component('servo', 'feetech-sts3215')];
  const servo = box([0, 0, 0], [10, 10, 10]);

  for (const axis of [0, 1, 2]) {
    for (const side of ['min', 'max'] as const) {
      for (const gap of [10 - 1e-10, 10, 10 + 1e-10]) {
        const shell = box([-11, -11, -11], [21, 21, 21]);

        shell[side][axis] = side === 'min' ? -gap : 10 + gap;

        const scene = { parts, measures: { printed: shell, servo }, joints: [] };
        const heat = row(run(scene), 'Heat near servos')!;

        expect(heat.status).toBe(gap > 10 ? 'pass' : 'warn');
        expect(row(run(scene, {}, { servoTouches: [] }), 'Heat near servos')!.status).toBe('pass');
        expect(row(run(scene, {}, { servoTouches: ['printed'] }), 'Heat near servos')!.ids).toEqual(['printed']);
      }
    }
  }
});

it('retains duplicate occurrences and refuses separated or nonfinite bounds without changing prior results', () => {
  const printed = part('printed');
  const servo = component('servo', 'feetech-sts3215');
  const parts = [servo, printed, servo, printed];
  const measure = box([0, 0, 0], [10, 10, 10]);
  const measures = { printed: measure, servo: measure };
  const pairs = servoTouchPairs(parts, measures);

  expect(pairs).toEqual(Array.from({ length: 4 }, () => ['printed', 'servo']));

  for (const value of [NaN, Infinity, -Infinity, 100]) {
    const edited = { ...measures, servo: box([value, 0, 0], [value, 10, 10]) };

    expect(servoTouchPairs(parts, edited)).toEqual(referencePairs(parts, edited));
  }

  pairs[0][0] = 'changed';
  expect(servoTouchPairs(parts, measures)).toEqual(Array.from({ length: 4 }, () => ['printed', 'servo']));
  expect(servoTouchPairs([], {})).toEqual([]);
  expect(servoTouchPairs(parts, {})).toEqual([]);
});
