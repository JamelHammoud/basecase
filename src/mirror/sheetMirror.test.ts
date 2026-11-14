import { BoxGeometry, Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { detectSheet } from '../sheet/detectSheet';
import { applySheet } from '../sheet/materials';
import { sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, worldTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { mirrorPart } from './mirrorPart';
import { reflectPoint, type MirrorAxis } from './plane';

function tilted() {
  const geometry = new BoxGeometry(80, 60, 3).toNonIndexed().rotateX(0.43).rotateY(0.29);
  const positions = Array.from(geometry.getAttribute('position').array);
  const size = new Box3().setFromArray(positions).getSize(new Vector3()).toArray();
  const original = sheetPart({
    kind: 'mesh',
    position: [35, 20, 15],
    rotation: [20, 30, 40],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    mesh: { positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i), baseSize: size },
  });
  const group = buildPartGroup(original, false);
  const profile = detectSheet(localTriangles(group))!;

  geometry.dispose();
  releasePartGroup(group);

  return applySheet(original, { material: 'aluminum-6061', thicknessMm: 4.8 }, profile);
}

function triangles(part: ScenePart) {
  const group = buildPartGroup(part, false);
  const world = worldTriangles(group);
  const thickness = detectSheet(localTriangles(group))?.thicknessMm;

  releasePartGroup(group);

  return { world, thickness };
}

describe('mirroring an affine sheet', () => {
  it.each<MirrorAxis>([0, 1, 2])('reflects every transformed vertex across axis %i', (axis) => {
    const source = tilted();
    const plane = { axis, offset: 12 };
    const mirrored = mirrorPart(source, plane);
    const original = triangles(source);
    const actual = triangles(mirrored);
    const points = Array.from({ length: actual.world.length / 3 }, (_, i) =>
      new Vector3().fromArray(actual.world, i * 3),
    );

    for (let i = 0; i < original.world.length; i += 3) {
      const reflected = new Vector3(...reflectPoint(new Vector3().fromArray(original.world, i).toArray(), plane));

      expect(Math.min(...points.map((point) => point.distanceTo(reflected)))).toBeLessThan(0.0001);
    }

    expect(actual.thickness).toBeCloseTo(4.75, 3);
    expect(mirrored.sheet).toEqual(source.sheet);
    triangles(mirrorPart(mirrored, plane)).world.forEach((value, i) => expect(value).toBeCloseTo(original.world[i], 4));
  });
});
