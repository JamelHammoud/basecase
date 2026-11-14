import { Box3, BoxGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { detectSheet } from '../sheet/detectSheet';
import { applySheet } from '../sheet/materials';
import { sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, convertScenePartToSculptMesh, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, measureObject, worldTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { withSculptMesh } from './sculptEdits';

function sheet() {
  const geometry = new BoxGeometry(80, 60, 3).toNonIndexed().rotateX(0.43).rotateY(0.29);
  const positions = Array.from(geometry.getAttribute('position').array);
  const size = new Box3().setFromArray(positions).getSize(new Vector3()).toArray();
  const original = sheetPart({
    kind: 'mesh',
    position: [20, 30, 40],
    rotation: [10, 20, 30],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    mesh: { positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i), baseSize: size },
  });
  const group = buildPartGroup(original, false);
  const profile = detectSheet(localTriangles(group))!;

  geometry.dispose();
  releasePartGroup(group);

  return applySheet(original, { material: 'aluminum-6061', thicknessMm: 4.8 }, profile);
}

function geometryOf(part: ScenePart) {
  const group = buildPartGroup(part, false);
  const bounds = new Box3().setFromArray(worldTriangles(group));
  const measure = measureObject(group);

  releasePartGroup(group);

  return { bounds, measure };
}

describe('sculpting a sheet', () => {
  it('bakes the current affine geometry once and returns the edited part to printing', () => {
    const original = sheet();
    const converted = convertScenePartToSculptMesh(original);
    const edited = withSculptMesh(original, converted);
    const before = geometryOf(original);
    const after = geometryOf(edited);

    expect(original.sheetTransform).toHaveLength(16);
    expect(edited.sheetTransform).toBeUndefined();
    expect(edited.sheet).toBeUndefined();
    expect(isPrinted(edited)).toBe(true);
    expect(after.bounds.min.distanceTo(before.bounds.min)).toBeLessThan(0.02);
    expect(after.bounds.max.distanceTo(before.bounds.max)).toBeLessThan(0.02);
    expect(after.measure.volumeMm3 / before.measure.volumeMm3).toBeCloseTo(1, 2);
    expect(original.sheet?.material).toBe('aluminum-6061');
  });

  it('clears a legacy sheet material when sculpted geometry is committed', () => {
    const original = { ...sheet(), sheet: undefined, mechanicalTag: 'CNC Aluminum' };
    const edited = withSculptMesh(original, convertScenePartToSculptMesh(original));

    expect(edited.mechanicalTag).toBe('3D Printed PLA/PETG');
    expect(edited.sheetTransform).toBeUndefined();
    expect(isPrinted(edited)).toBe(true);
  });
});
