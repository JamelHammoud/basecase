import * as THREE from 'three';
import { expect, it } from 'vitest';
import { printReportOf, worldMeasure } from './shapeReports';
import { solidFromPositions } from './shapeSolid';
import { ownedShapeReport } from './ownedShapeReport';

function independent(original: unknown, copy: unknown): void {
  if (original === null || typeof original !== 'object') return;

  expect(copy).not.toBe(original);

  for (const [key, value] of Object.entries(original)) independent(value, (copy as Record<string, unknown>)[key]);
}

it('matches structured cloning and owns every nested vector through actual print reports, sheets and empty shapes', () => {
  const geometries = [
    new THREE.BoxGeometry(20, 10, 15),
    new THREE.BoxGeometry(100, 1, 70),
    new THREE.CylinderGeometry(5, 8, 20, 8),
    new THREE.SphereGeometry(10, 8, 6),
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3)),
  ];

  for (const source of geometries) {
    const geometry = source.index ? source.toNonIndexed() : source;
    const solid = solidFromPositions(new Float32Array(geometry.getAttribute('position').array));
    const result = printReportOf(solid, [[0.3, -1, 0.5]]);

    result.measure = worldMeasure(solid, new THREE.Matrix4().makeTranslation(4, 5, 6));

    if (result.measure.sheet) {
      result.measure.sheet.center = [4, 5, 6];
      result.measure.sheet.holes = [
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      ];
    }

    const owned = ownedShapeReport(result);

    expect(owned).toEqual(structuredClone(result));
    independent(result, owned);
    solid.dispose();
    geometry.dispose();
    source.dispose();
  }
});
