import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pulleyLength } from '../data/frameHardware';
import { makeSpec } from '../data/hardware';
import { GT2_IDLERS, GT2_PULLEYS, MISUMI_GPA_GT2060_WIDTH as W, type Gt2Pulley } from '../data/motionTables';
import { DRIVE_BUILDERS } from './driveMesh';
import { holePath, prism } from './hardwarePrimitives';

function referenceTeeth(p: Gt2Pulley): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const radius = p.od / 2;
  const step = (Math.PI * 2) / p.teeth;

  for (let i = 0; i < p.teeth; i++) {
    const a = i * step;
    const points = [
      [radius, a],
      [radius, a + step * 0.5],
      [radius - 0.75, a + step * 0.62],
      [radius - 0.75, a + step * 0.88],
    ];

    for (const [r, angle] of points) {
      if (i === 0 && angle === a) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }

  shape.closePath();
  shape.holes.push(holePath(p.bore / 2, 32));

  const hub = p.hubD ? pulleyLength(p) - W.widthOverFlangesW : 0;
  const boss = (W.widthOverFlangesW - W.toothWidthA - 2 * W.flangeThickness) / 2;

  return prism(shape, W.toothWidthA, hub + W.flangeThickness + boss);
}

describe('GT2 drive geometry', () => {
  for (const type of ['gt2_pulley', 'gt2_idler'] as const) {
    const table = type === 'gt2_pulley' ? GT2_PULLEYS : GT2_IDLERS;

    it(`preserves exact tooth geometry for every catalog ${type}`, () => {
      const original = structuredClone(table);
      const material = new THREE.MeshBasicMaterial();

      for (const [size, pulley] of Object.entries(table)) {
        const geometries: THREE.BufferGeometry[] = [];

        DRIVE_BUILDERS[type]({
          spec: makeSpec(type, { size }),
          size: 'M3',
          L: 0,
          m: { main: material, dark: material, nylon: material },
          add: (geometry) => geometries.push(geometry),
        });

        const actual = geometries[pulley.hubD ? 4 : 2];
        const expected = referenceTeeth(pulley);

        expect(actual.index?.array, size).toEqual(expected.index?.array);
        expect(actual.groups, size).toEqual(expected.groups);

        for (const name of Object.keys(expected.attributes)) {
          expect(actual.getAttribute(name).array, `${size}: ${name}`).toEqual(expected.getAttribute(name).array);
        }

        geometries.forEach((geometry) => geometry.dispose());
        expected.dispose();
      }

      expect(table).toEqual(original);
      material.dispose();
    });
  }
});
