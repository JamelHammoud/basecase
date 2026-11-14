import { Box3, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { presetCase } from '../cases/caseBuilder';
import { sheetPart } from '../sheet/sheet.fixtures';
import { fixtureRobot } from '../skills/fixtureModels';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, measureObject, worldTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { galleryBundleOf } from './buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from './galleryBundle';

function meshOf(part: ScenePart) {
  const group = buildPartGroup(part, false);
  const local = localTriangles(group);
  const bounds = new Box3().setFromArray(worldTriangles(group));
  const measure = measureObject(group);

  releasePartGroup(group);

  return { local, bounds, measure };
}

describe('sharing a baked affine sheet', () => {
  it('round-trips current geometry without stretching its inlined mesh twice', () => {
    const original = sheetPart({
      position: [20, 30, 40],
      rotation: [15, 25, 35],
      sheet: { material: 'aluminum-6061', thicknessMm: 4.75 },
      sheetTransform: new Matrix4().set(1, 0, 0.3, 7, 0, 1, 0.2, -3, 0.3, 0.2, 1.6, 2, 0, 0, 0, 1).toArray(),
    });
    const expected = meshOf(original);
    const source = { ...original, kind: 'component' as const, componentId: 'sourced-sheet-plate-1234' };
    const rover = fixtureRobot('rover-diff');
    const kase = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
    const bundle = galleryBundleOf({
      slug: 'sheet-robot',
      title: 'Sheet robot',
      robotName: 'Robot',
      parts: [source],
      joints: [],
      kase,
      triangles: () => expected.local,
    });
    const loaded = readGalleryBundleBytes(galleryBundleBytes(bundle)).robot.parts[0];
    const actual = meshOf(loaded);

    expect(loaded.kind).toBe('mesh');
    expect(loaded.sheetTransform).toBeUndefined();
    expect(loaded.sheet).toEqual(original.sheet);
    expect(actual.bounds.min.distanceTo(expected.bounds.min)).toBeLessThan(0.02);
    expect(actual.bounds.max.distanceTo(expected.bounds.max)).toBeLessThan(0.02);
    expect(actual.measure.volumeMm3 / expected.measure.volumeMm3).toBeCloseTo(1, 2);
    expect(source.sheetTransform).toEqual(original.sheetTransform);
  });
});
