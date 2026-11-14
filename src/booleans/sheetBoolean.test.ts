import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { detectSheet } from '../sheet/detectSheet';
import { applySheet } from '../sheet/materials';
import { plateTriangles, sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, measureObject } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { evaluateBoolean } from './evaluate';
import { booleanHash } from './hash';
import { booleanPart, withResult, type BooleanPart } from './parts';

function tiltedSheet() {
  const positions = Array.from(plateTriangles({ tilt: true }));
  const size = new Box3().setFromArray(positions).getSize(new Vector3()).toArray();

  return sheetPart({
    kind: 'mesh',
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    mesh: { positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i), baseSize: size },
  });
}

function thicker(part: ScenePart) {
  const group = buildPartGroup(part, false);
  const profile = detectSheet(localTriangles(group))!;

  releasePartGroup(group);

  return applySheet(part, { material: 'aluminum-6061', thicknessMm: 4.8 }, profile);
}

const enclosure = sheetPart({ id: 'enclosure', dimensions: { width: 500, height: 500, depth: 500 } });
const intersection = (base: ScenePart) =>
  booleanPart({ id: 'intersection', base, tools: [enclosure], op: 'intersect' });

async function evaluated(part: BooleanPart) {
  return withResult(part, booleanHash(part), await evaluateBoolean(part));
}

function thickness(part: ScenePart) {
  const group = buildPartGroup(part, false);
  const measure = measureObject(group);
  const profile = detectSheet(localTriangles(group));

  releasePartGroup(group);

  return { measure, profile };
}

describe('sheet thickness through booleans', () => {
  it('keeps the affine thickness of an imported mesh operand', async () => {
    const original = tiltedSheet();
    const changed = thicker(original);
    const result = await evaluated(intersection(changed));
    const actual = thickness(result);

    expect(changed.sheetTransform).toHaveLength(16);
    expect(actual.profile?.thicknessMm).toBeCloseTo(4.75, 3);
    expect(actual.measure.volumeMm3 / thickness(original).measure.volumeMm3).toBeCloseTo(4.75 / 3, 3);
  });

  it('keeps the affine thickness when the operand is itself a boolean result', async () => {
    const inner = await evaluated(intersection(tiltedSheet()));
    const changed = thicker(inner);
    const result = await evaluated(intersection({ ...changed, id: 'inner' }));

    expect(changed.sheetTransform).toHaveLength(16);
    expect(thickness(result).profile?.thicknessMm).toBeCloseTo(4.75, 3);
  });
});
