import { BoxGeometry, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applySpec, specToPart } from './agentScene';
import { findPort, worldPort } from './ports';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import { detectSheet } from '../sheet/detectSheet';

function plate(tilted = false) {
  const geometry = new BoxGeometry(80, 60, 3);
  const tilt = new Matrix4().makeRotationX(tilted ? 0.43 : 0);
  const position = new Vector3(0, 0, 1.5).applyMatrix4(tilt).toArray() as [number, number, number];
  const axis = new Vector3(0, 0, 1).transformDirection(tilt).toArray() as [number, number, number];

  geometry.applyMatrix4(tilt);

  const part = specToPart({
    id: 'plate',
    shape: 'cad_part',
    cad: {
      language: 'openscad',
      code: 'cube([80,60,3],center=true);',
      positions: Array.from(geometry.getAttribute('position').array),
      indices: Array.from(geometry.index!.array),
      ports: [{ name: 'top', kind: 'face', position, axis, ref: [1, 0, 0], depthMm: 3 }],
    },
  });
  const group = buildPartGroup(part, false);
  const profile = detectSheet(localTriangles(group))!;

  geometry.dispose();
  releasePartGroup(group);

  return { part, profile };
}

describe('sheet mounting ports', () => {
  it('moves a top face port and its depth with stocked thickness', () => {
    const { part, profile } = plate();
    const updated = applySpec(part, { id: 'plate', sheet: { material: 'aluminum-6061', thicknessMm: 3.18 } }, profile);
    const top = findPort(updated, 'top')!;

    expect(top.position[1]).toBeCloseTo(1.59);
    expect(top.axis).toEqual([0, 1, 0]);
    expect(top.ref).toEqual([1, 0, 0]);
    expect(top.depthMm).toBeCloseTo(3.18);
    expect(worldPort(updated, top).position[1]).toBeCloseTo(1.59);
  });

  it('moves a tilted port through the same affine transform as the sheet surfaces', () => {
    const { part, profile } = plate(true);
    const before = findPort(part, 'top')!;
    const updated = applySpec(part, { id: 'plate', sheet: { material: 'aluminum-6061', thicknessMm: 3.18 } }, profile);
    const top = findPort(updated, 'top')!;
    const expected = new Vector3(...before.position).applyMatrix4(new Matrix4().fromArray(updated.sheetTransform!));

    top.position.forEach((value, i) => expect(value).toBeCloseTo(expected.toArray()[i], 5));
    expect(new Vector3(...top.axis).length()).toBeCloseTo(1);
    expect(new Vector3(...top.ref!).dot(new Vector3(...top.axis))).toBeCloseTo(0);
    expect(top.depthMm).toBeCloseTo(3.18);
  });

  it('keeps the existing port behavior on a part without a sheet setting', () => {
    const { part } = plate();
    const resized = applySpec(part, { id: 'plate', size: [100, 100, 100] });

    expect(findPort(resized, 'top')).toEqual(findPort(part, 'top'));
  });
});
