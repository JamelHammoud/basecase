import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { eulerToMatrix, type V3 } from '../agent/agentFrame';
import { specToPart } from '../agent/agentScene';
import { findPort, worldPort } from '../agent/ports';
import { box } from '../sim/fixtures/parts';
import { buildPartGroup } from '../three/buildPartMesh';
import type { PartKind, ScenePart } from '../types/robotics';
import { mirrorPart } from './mirrorPart';
import { reflectPoint, type MirrorPlane } from './plane';

const SIDE: MirrorPlane = { axis: 0, offset: 25 };
const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function worldVertices(part: ScenePart): string[] {
  const group = buildPartGroup(part, false);
  const out = new Set<string>();

  group.updateMatrixWorld(true);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;

    if (!mesh.isMesh) return;

    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      out.add(
        v
          .toArray()
          .map((x) => Math.round(x * 10) / 10 + 0)
          .join(','),
      );
    }
  });

  return [...out].sort();
}

function reflected(part: ScenePart, plane: MirrorPlane): string[] {
  return worldVertices(part)
    .map((s) => reflectPoint(s.split(',').map(Number) as V3, plane).map((x) => Math.round(x * 10) / 10 + 0))
    .map((v) => v.join(','))
    .sort();
}

const shape = (kind: PartKind, rotation: V3): ScenePart => ({
  ...box('shape', [60, 30, -15], [20, 30, 12], 10),
  kind,
  rotation,
});

describe('mirrorPart', () => {
  it('puts a box at the exact opposite position', () => {
    const copy = mirrorPart(box('b', [60, 10, -15], [20, 20, 20], 10), SIDE);

    expect(copy.position).toEqual([-10, 10, -15]);
    expect(copy.rotation).toEqual([0, 0, 0]);
  });

  it.each([
    ['wedge', [0, 0, 0]],
    ['wedge', [0, 90, 0]],
    ['cone', [0, 0, 0]],
    ['cone', [30, 0, 45]],
    ['pyramid', [90, 0, 0]],
    ['dome', [0, 0, 90]],
    ['box', [20, 40, 60]],
  ] as Array<[PartKind, V3]>)('mirrors a %s at %j shape and all', (kind, rotation) => {
    const src = shape(kind, rotation);

    for (const plane of [SIDE, { axis: 1, offset: 0 }, { axis: 2, offset: -8 }] as MirrorPlane[]) {
      expect(worldVertices(mirrorPart(src, plane))).toEqual(reflected(src, plane));
    }
  });

  it('places a catalog servo as the same servo, turned, with its output on the mirrored axis', () => {
    const src = specToPart({
      id: 'left_hip',
      catalog: 'component:feetech-sts3215|c018',
      position: [55, 80, -12],
      rotation: [35, -20, 110],
    });
    const copy = mirrorPart(src, SIDE);
    const want = worldPort(src, findPort(src, 'output')!);
    const got = worldPort(copy, findPort(copy, 'output')!);

    expect(copy.componentId).toBe('feetech-sts3215');
    expect(copy.kind).toBe('component');
    expect(eulerToMatrix(copy.rotation).determinant()).toBeCloseTo(1, 6);
    expect(gap(got.position, reflectPoint(want.position, SIDE))).toBeLessThan(0.1);
  });

  it('flips a mesh part and reverses its winding so it faces out', () => {
    const src: ScenePart = {
      ...shape('mesh', [0, 0, 0]),
      mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], baseSize: [1, 1, 1] },
    };
    const copy = mirrorPart(src, SIDE);

    expect(copy.mesh!.positions).toEqual([-0, 0, 0, -1, 0, 0, -0, 1, 0]);
    expect(copy.mesh!.indices).toEqual([0, 2, 1]);
  });

  it('turns a twist the other way', () => {
    const copy = mirrorPart({ ...shape('box', [0, 0, 0]), deformers: { twistDeg: 30 } }, SIDE);

    expect(copy.deformers?.twistDeg).toBe(-30);
  });
});
