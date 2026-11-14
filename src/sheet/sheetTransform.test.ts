import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import { applySheet } from './materials';
import { detectSheet } from './detectSheet';
import { plateTriangles, sheetPart } from './sheet.fixtures';
import { shapeKey } from '../print/shapeKey';

function tiltedPart() {
  const positions = Array.from(plateTriangles({ concave: true, tilt: true }));
  const size = new Box3().setFromArray(positions).getSize(new Vector3()).toArray();

  return sheetPart({
    kind: 'mesh',
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    mesh: { positions, indices: positions.map((_, i) => i).filter((i) => i < positions.length / 3), baseSize: size },
  });
}

function profileOf(part: ReturnType<typeof sheetPart>) {
  const group = buildPartGroup(part, false);
  const profile = detectSheet(localTriangles(group));

  releasePartGroup(group);

  return profile!;
}

describe('tilted sheet thickness', () => {
  it('stretches only thickness and keeps concave outlines, holes and source arrays unchanged', () => {
    const part = tiltedPart();
    const original = profileOf(part);
    const changed = applySheet(part, { material: 'aluminum-6061', thicknessMm: 4.8 }, original);
    const measured = profileOf(changed);

    expect(measured.thicknessMm).toBeCloseTo(4.75, 3);
    expect(measured.outline).toHaveLength(original.outline.length);
    expect(measured.holes).toHaveLength(4);
    original.outline.forEach((point, i) =>
      point.forEach((value, axis) => expect(measured.outline[i][axis]).toBeCloseTo(value, 3)),
    );
    expect(changed.mesh).toBe(part.mesh);
    expect(shapeKey(changed)).not.toBe(shapeKey(part));

    const again = applySheet(changed, { material: 'carbon-fiber', thicknessMm: 2 }, measured);

    expect(profileOf(again).thicknessMm).toBeCloseTo(2.01, 3);
  });
});
