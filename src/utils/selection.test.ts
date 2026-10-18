import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { alignParts, halfExtents } from './selection';

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
  it('matches three.js bounds for a rotated part', () => {
    const p = part({ id: 'a', rotation: [30, 45, 60] });
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
});
