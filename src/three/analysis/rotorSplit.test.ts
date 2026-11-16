import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { outputLine, splitRotor } from './rotorSplit';
import { ShapeSolid } from './shapeSolid';

function box(size: [number, number, number], center: [number, number, number]): Float32Array {
  const geometry = new THREE.BoxGeometry(...size).toNonIndexed().translate(...center);
  const positions = new Float32Array(geometry.getAttribute('position').array);

  geometry.dispose();

  return positions;
}

const combined = (bodies: Float32Array[]) => new Float32Array(bodies.flatMap((body) => [...body]));

function previousPartition(bodies: Float32Array[]) {
  const line = outputLine(combined(bodies));
  const foot = new THREE.Vector3();
  const point = new THREE.Vector3();
  const distance = (p: THREE.Vector3) => line.closestPointToPoint(p, false, foot).distanceTo(p);
  const measured = bodies.map((body) => {
    let reach = 0;

    for (let i = 0; i < body.length; i += 3) reach = Math.max(reach, distance(point.fromArray(body, i)));

    const center = new THREE.Box3().setFromArray(body).getCenter(point);

    return { reach, offset: distance(center) };
  });
  const maxReach = Math.max(...measured.map((body) => body.reach));
  const rotor = bodies.filter((_, i) => measured[i].offset <= 1 && measured[i].reach <= 0.8 * maxReach);
  const stator = bodies.filter((body) => !rotor.includes(body));

  return rotor.length && stator.length ? { rotor: combined(rotor), stator: combined(stator) } : null;
}

describe('servo rotor classification', () => {
  it('preserves complete partitions near axis and reach limits across mesh translations and scales', () => {
    const offsets = [0, 0.999, 1, 1.001, -1, 12, 19.999, 20, 20.001];

    for (let i = 0; i < 90; i++) {
      const scale = [0.5, 1, 2][i % 3];
      const limit = (2 * 0.8 * Math.hypot(25, 15)) / Math.SQRT2;
      const hornWidth = [8, limit - 0.001, limit, limit + 0.001, 38][i % 5];
      const bodies = [
        box([40, 20, 30], [-5, 0, 0]),
        box([hornWidth, 2, hornWidth], [0, 14, 0]),
        box([2, 2, 2], [offsets[i % offsets.length], 11.5, 0]),
      ].map((body) => body.map((value, axis) => value * scale + [i * 3, i - 40, -i * 2][axis % 3]));
      const positions = combined(bodies);
      const before = positions.slice();
      const expected = previousPartition(bodies);
      const solid = new ShapeSolid(positions);
      const actual = splitRotor(solid);

      expect(actual?.rotor.positions ?? null).toEqual(expected?.rotor ?? null);
      expect(actual?.stator.positions ?? null).toEqual(expected?.stator ?? null);
      expect(positions).toEqual(before);
      expect(splitRotor(solid)).toBe(actual);
    }
  });

  it('keeps a connected servo rigid and prepares replacement geometry independently', () => {
    const body = box([40, 20, 30], [0, 0, 0]);
    const rigid = new ShapeSolid(body);

    expect(splitRotor(rigid)).toBeNull();

    const replacement = new ShapeSolid(combined([body, box([8, 2, 8], [0, 14, 0])]));
    const split = splitRotor(replacement);

    expect(split?.rotor.positions).toEqual(box([8, 2, 8], [0, 14, 0]));
    expect(split?.stator.positions).toEqual(body);
    expect(splitRotor(rigid)).toBeNull();
  });
});

it.each([1, 25, 50])(
  'preserves interleaved triangle order and independent output storage with %i repeats',
  (repeats) => {
    const stator = box([40, 20, 30], [0, 0, 0]);
    const rotor = box([8, 2, 8], [0, 14, 0]);
    const positions = new Float32Array((stator.length + rotor.length) * repeats);

    for (let t = 0; t < 12 * repeats; t++) {
      const offset = (t % 12) * 9;

      positions.set(stator.subarray(offset, offset + 9), t * 18);
      positions.set(rotor.subarray(offset, offset + 9), t * 18 + 9);
    }

    const before = positions.slice();
    const solid = new ShapeSolid(positions);
    const split = splitRotor(solid)!;

    expect(split.stator.positions).toEqual(combined(Array.from({ length: repeats }, () => stator)));
    expect(split.rotor.positions).toEqual(combined(Array.from({ length: repeats }, () => rotor)));
    expect(split.stator.positions.buffer).not.toBe(positions.buffer);
    expect(split.rotor.positions.buffer).not.toBe(positions.buffer);
    expect(split.stator.positions.buffer).not.toBe(split.rotor.positions.buffer);
    expect(positions).toEqual(before);
    expect(splitRotor(solid)).toBe(split);
    expect(splitRotor(new ShapeSolid(positions.slice()))?.rotor.positions).toEqual(split.rotor.positions);
  },
);
