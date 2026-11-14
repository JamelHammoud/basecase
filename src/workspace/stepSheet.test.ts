import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { detectSheet } from '../sheet/detectSheet';
import { applySheet } from '../sheet/materials';
import { plateTriangles, sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { stepJob } from './stepExport';
import { exactSolid, TO_STEP } from './stepSolids';

function tiltedCad(): ScenePart {
  const positions = Array.from(plateTriangles({ tilt: true, concave: true }));
  const bounds = new Box3().setFromArray(positions);
  const size = bounds.getSize(new Vector3()).toArray();
  const center = bounds.getCenter(new Vector3()).toArray();

  return sheetPart({
    kind: 'cad_part',
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    cad: {
      language: 'replicad',
      code: 'return makeBox([0, 0, 0], [80, 60, 3]);',
      positions,
      indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
      baseSize: size,
      originOffset: center,
    },
  });
}

function changedSheet() {
  const original = tiltedCad();
  const group = buildPartGroup(original, false);
  const profile = detectSheet(localTriangles(group))!;

  releasePartGroup(group);

  return { original, changed: applySheet(original, { material: 'aluminum-6061', thicknessMm: 4.8 }, profile) };
}

describe('STEP export of a transformed sheet', () => {
  it('uses the current mesh instead of re-running the original CAD source', () => {
    const { original, changed } = changedSheet();

    expect(exactSolid(original)?.type).toBe('moved');
    expect(changed.sheetTransform).toHaveLength(16);
    expect(exactSolid(changed)).toBeNull();
  });

  it('sends the actual stock thickness and transformed bounds in the STEP mesh body', async () => {
    const { original, changed } = changedSheet();
    const { job, left } = await stepJob([changed], 'Sheet');
    const solid = job.bodies[0].solid;
    const rendered = buildPartGroup(changed, false);
    const expected = new Box3().setFromArray(localTriangles(rendered)).applyMatrix4(TO_STEP);

    releasePartGroup(rendered);

    expect(left).toBe(0);
    expect(solid.type).toBe('mesh');

    if (solid.type !== 'mesh') throw new Error('Transformed sheet must export its current mesh.');

    const positions = new Float32Array(solid.positions);
    const actual = new Box3().setFromArray(positions);
    const fromStep = TO_STEP.clone().invert();
    const vertex = new Vector3();

    for (let i = 0; i < positions.length; i += 3) {
      vertex.fromArray(positions, i).applyMatrix4(fromStep).toArray(positions, i);
    }

    expect(detectSheet(positions)?.thicknessMm).toBeCloseTo(4.75, 3);
    expect(actual.min.distanceTo(expected.min)).toBeLessThan(0.0001);
    expect(actual.max.distanceTo(expected.max)).toBeLessThan(0.0001);
    expect(changed.cad).toBe(original.cad);
    expect(new Matrix4().fromArray(changed.sheetTransform!).determinant()).toBeCloseTo(4.75 / 3, 3);
  });
});
