import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { drawingDesign } from './drawing.fixtures';
import { prepareDrawings } from './drawings';

it('projects rotated and mirrored production coordinates in the chosen scene frame without applying world translation', async () => {
  const part = drawingDesign(4);
  const positions = Float32Array.from(part.mesh!.positions);
  const production = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  const matrix = new Matrix4().makeRotationFromEuler(
    new Euler(...(part.rotation.map((n) => (n * Math.PI) / 180) as [number, number, number])),
  );

  matrix.multiply(new Matrix4().fromArray(part.sheetTransform!));
  production.applyMatrix4(matrix);

  production.computeBoundingBox();

  const box = production.boundingBox!;
  const manifest = await prepareDrawings({
    parts: [{ ...part, position: [1000, -300, 99] }],
    source: { id: 'rotated', name: 'Rotated mount', fingerprint: 'source' },
    options: { frame: 'scene', plane: 'xy', scale: 0.5 },
  });
  const sheet = manifest.sheets[0];

  sheet.datum.forEach((value, axis) => expect(value).toBeCloseTo(box.min.getComponent(axis), 4));
  sheet.extents.forEach((value, axis) =>
    expect(value).toBeCloseTo(box.max.getComponent(axis) - box.min.getComponent(axis), 4),
  );

  const point = new Vector3()
    .fromArray(part.mesh!.positions)
    .applyMatrix4(new Matrix4().fromArray(part.sheetTransform!));
  const projected = point.clone().applyMatrix4(new Matrix4().fromArray(sheet.projectionMatrix));
  const expected = point
    .applyEuler(new Euler(...(part.rotation.map((n) => (n * Math.PI) / 180) as [number, number, number])))
    .sub(box.min);

  expect(projected.distanceTo(expected)).toBeLessThan(0.0001);
  expect(sheet.geometryFrame).toBe('Z-up');
  expect(sheet.mode).toBe('outline-only');
  expect(sheet.views).toHaveLength(3);
  production.dispose();
});
