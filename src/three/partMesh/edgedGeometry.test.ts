import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PartEdges, PartKind, ScenePart } from '../../types/robotics';
import { partEdges } from '../../utils/partEdges';
import { buildPartGroup } from '../buildPartMesh';
import { measureTriangles, worldTriangles } from '../meshMeasure';
import { applyDeformersToBufferGeometry } from '../sculptEngine';

const part = (kind: PartKind, size: [number, number, number], extra: Partial<ScenePart> = {}): ScenePart => ({
  id: `p-${kind}`,
  name: kind,
  kind,
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const measured = (p: ScenePart) => measureTriangles(worldTriangles(buildPartGroup(p, false)));

function signedVolume(t: Float32Array): number {
  let sum = 0;

  for (let i = 0; i < t.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((k) => new THREE.Vector3().fromArray(t, i + k));

    sum += a.dot(b.cross(c)) / 6;
  }

  return sum;
}

const minkowski = (size: [number, number, number], r: number, kind: PartEdges['kind']) => {
  const [a, b, c] = size.map((s) => s - 2 * r);
  const faces = a * b + b * c + a * c;
  const lengths = a + b + c;

  return kind === 'fillet'
    ? a * b * c + 2 * r * faces + Math.PI * r * r * lengths + (4 / 3) * Math.PI * r ** 3
    : a * b * c + 2 * r * faces + 2 * r * r * lengths + (4 / 3) * r ** 3;
};

const offBy = (value: number, expected: number) => Math.abs(value - expected) / expected;

describe('edged basic shapes', () => {
  it('fillets a 40 × 20 × 10 mm box by 3 mm to the rounded volume, inside the same box', () => {
    const m = measured(part('box', [40, 10, 20], { edges: { kind: 'fillet', mm: 3 } }));

    expect(offBy(m.volumeMm3, minkowski([40, 10, 20], 3, 'fillet'))).toBeLessThan(0.005);
    m.min.forEach((v, i) => expect(v).toBeCloseTo([-20, -5, -10][i], 3));
    m.max.forEach((v, i) => expect(v).toBeCloseTo([20, 5, 10][i], 3));
  });

  it('chamfers a cube by 2 mm to the chamfered volume', () => {
    const m = measured(part('cube', [20, 20, 20], { edges: { kind: 'chamfer', mm: 2 } }));

    expect(offBy(m.volumeMm3, minkowski([20, 20, 20], 2, 'chamfer'))).toBeLessThan(0.005);
  });

  it('clamps a radius past half the smallest dimension to just under it', () => {
    const box = part('box', [40, 10, 20], { edges: { kind: 'fillet', mm: 8 } });
    const edges = partEdges(box)!;
    const m = measured(box);

    expect(edges.mm).toBeLessThan(5);
    expect(edges.mm).toBeGreaterThan(4.5);
    expect(m.max[1] - m.min[1]).toBeCloseTo(10, 3);
    expect(offBy(m.volumeMm3, minkowski([40, 10, 20], edges.mm, 'fillet'))).toBeLessThan(0.005);
  });

  it('keeps a filleted cylinder at its diameter and height', () => {
    const m = measured(part('cylinder', [30, 40, 30], { edges: { kind: 'fillet', mm: 4 } }));

    expect(m.max[0] - m.min[0]).toBeCloseTo(30, 2);
    expect(m.max[2] - m.min[2]).toBeCloseTo(30, 2);
    expect(m.max[1] - m.min[1]).toBeCloseTo(40, 3);
    expect(m.volumeMm3).toBeLessThan(Math.PI * 15 * 15 * 40);
    expect(m.volumeMm3).toBeGreaterThan(Math.PI * 15 * 15 * 40 * 0.95);
  });

  it.each<[PartKind, [number, number, number], PartEdges['kind']]>([
    ['box', [30, 12, 18], 'chamfer'],
    ['cylinder', [24, 30, 24], 'chamfer'],
    ['tube', [40, 20, 40], 'fillet'],
    ['tube', [40, 20, 40], 'chamfer'],
    ['hex_prism', [30, 16, 30], 'fillet'],
    ['hex_prism', [30, 16, 30], 'chamfer'],
    ['wedge', [30, 20, 16], 'fillet'],
    ['wedge', [30, 20, 16], 'chamfer'],
  ])('builds a closed, outward %s with a %s, smaller than the sharp one', (kind, size, edge) => {
    const sharp = measured(part(kind, size));
    const t = worldTriangles(buildPartGroup(part(kind, size, { edges: { kind: edge, mm: 2 } }), false));
    const m = measureTriangles(t);

    expect(signedVolume(t)).toBeCloseTo(m.volumeMm3, 0);
    expect(m.volumeMm3).toBeLessThan(sharp.volumeMm3);
    expect(m.volumeMm3).toBeGreaterThan(sharp.volumeMm3 * 0.8);
    m.max.forEach((v, i) => expect(v).toBeLessThanOrEqual(sharp.max[i] + 1e-3));
  });

  it('renders an old scene with Round exactly as before', () => {
    const deformers = { roundness: 0.5, taper: 0.2 };
    const group = buildPartGroup(part('box', [40, 10, 20], { deformers }), false);
    const mesh = group.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    const before = new THREE.BoxGeometry(40, 10, 20, 16, 16, 16);

    applyDeformersToBufferGeometry(before, deformers);

    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(
      Array.from(before.getAttribute('position').array),
    );
  });

  it('keeps Taper working on top of a fillet', () => {
    const m = measured(part('box', [40, 10, 20], { edges: { kind: 'fillet', mm: 3 }, deformers: { taper: 0.5 } }));

    expect(m.max[0] - m.min[0]).toBeGreaterThan(40);
  });
});
