import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { alignParts, distributeParts, halfExtents, type Axis } from './selection';

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 10, depth: 20 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

describe('halfExtents', () => {
  it.each<[number, number, number]>([
    [30, 45, 60],
    [-30, -45, -60],
    [90, 0, 0],
    [0, -90, 0],
    [0, 0, 180],
    [270, -450, 720],
  ])('matches three.js bounds at rotation %s, %s, %s', (x, y, z) => {
    const p = part({ id: 'a', rotation: [x, y, z] });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 20));

    mesh.rotation.set(...(p.rotation.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]), 'XYZ');
    mesh.updateMatrixWorld();

    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());

    halfExtents(p).forEach((h, i) => expect(h * 2).toBeCloseTo(size.getComponent(i), 6));
  });

  it('returns plain half sizes without rotation', () => {
    expect(halfExtents(part({ id: 'b' }))).toEqual([20, 5, 10]);
  });
});

describe('alignParts', () => {
  const parts = [
    part({ id: 'a', position: [0, 0, 0] }),
    part({ id: 'b', position: [50, 0, 0], dimensions: { width: 10, height: 10, depth: 10 } }),
    part({ id: 'c', position: [80, 0, 0], locked: true }),
  ];

  it('aligns to the shared bounds and skips locked parts', () => {
    const x = (ps: ScenePart[]) => ps.map((p) => p.position[0]);

    expect(x(alignParts(parts, ['a', 'b', 'c'], 0, 'min'))).toEqual([0, -15, 80]);
    expect(x(alignParts(parts, ['a', 'b', 'c'], 0, 'max'))).toEqual([35, 50, 80]);
    expect(x(alignParts(parts, ['a', 'b', 'c'], 0, 'center'))).toEqual([17.5, 17.5, 80]);
    expect(x(alignParts(parts, ['b'], 0, 'min'))).toEqual([0, 5, 80]);
  });

  it('keeps untouched references and returns the scene when no unlocked part is selected', () => {
    const result = alignParts(parts, ['b', 'b', 'missing'], 0, 'min');

    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result[0]).toBe(parts[0]);
    expect(result[2]).toBe(parts[2]);
    expect(parts[1].position).toEqual([50, 0, 0]);
    expect(alignParts(parts, ['c', 'missing'], 0, 'min')).toBe(parts);
    expect(alignParts(parts, [], 0, 'min')).toBe(parts);
  });
});

describe('distributeParts', () => {
  it.each<Axis>([0, 1, 2])('spreads along axis %i without reordering or changing other parts', (axis) => {
    const placed = (id: string, center: number, size: number) => {
      const position: [number, number, number] = [5, 6, 7];

      position[axis] = center;

      return part({ id, position, dimensions: { width: size, height: size, depth: size } });
    };
    const parts = [
      placed('last', 100, 30),
      part({ id: 'locked', locked: true, position: [1000, 1000, 1000] }),
      placed('first', 0, 10),
      placed('middle', 30, 20),
      placed('unselected', 2000, 40),
    ];
    const result = distributeParts(parts, ['middle', 'first', 'last', 'locked', 'missing', 'first'], axis);
    const expectedMiddle = [...parts[3].position];

    expectedMiddle[axis] = 45;
    expect(result.map((p) => p.id)).toEqual(parts.map((p) => p.id));
    expect(result[0].position).toEqual(parts[0].position);
    expect(result[1]).toBe(parts[1]);
    expect(result[2].position).toEqual(parts[2].position);
    expect(result[3].position).toEqual(expectedMiddle);
    expect(result[4]).toBe(parts[4]);
    expect(parts[3].position[axis]).toBe(30);
    expect(distributeParts(parts, ['first', 'last', 'locked'], axis)).toBe(parts);
    expect(distributeParts(parts, [], axis)).toBe(parts);
  });

  it('uses rotated bounds for the gaps', () => {
    const parts = [
      part({ id: 'first', rotation: [0, 0, 90], dimensions: { width: 10, height: 20, depth: 10 } }),
      part({ id: 'middle', position: [30, 0, 0], dimensions: { width: 20, height: 10, depth: 10 } }),
      part({ id: 'last', position: [100, 0, 0], dimensions: { width: 30, height: 10, depth: 10 } }),
    ];

    expect(distributeParts(parts, ['first', 'middle', 'last'], 0).map((p) => p.position[0])).toEqual([0, 47.5, 100]);
  });
});
