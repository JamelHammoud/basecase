import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { printerModel } from '../data/printers';
import { checkPrintability } from '../three/printability';
import { bedOf } from './bed';
import { choosePose, itemMatrix } from './plan';
import { weld, writeThreeMf } from './threeMf';

const bed = bedOf(printerModel('bambu-lab-p1s')!);

function lShape() {
  const a = new THREE.BoxGeometry(60, 8, 30).toNonIndexed();
  const b = new THREE.BoxGeometry(8, 40, 30).toNonIndexed().translate(26, 24, 0);
  const tris = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);

  return new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(tris, 3)))
    .rotateX(0.7)
    .rotateZ(0.3);
}

function placedBounds(tris: Float32Array, matrix: number[]) {
  const m = new THREE.Matrix4().fromArray(matrix);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  for (let i = 0; i < tris.length; i += 3) box.expandByPoint(v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m));

  return box;
}

describe('plate transforms', () => {
  const mesh = lShape();

  mesh.updateMatrixWorld();

  const tris = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).attributes.position.array as Float32Array;
  const shape = checkPrintability(tris)!;
  const check = choosePose(shape, bed);

  it('puts a tilted part flat on the bed, filling its packed rectangle', () => {
    for (const yaw of [0, 90]) {
      const [w, d] = yaw ? [check.size[1], check.size[0]] : [check.size[0], check.size[1]];
      const place = { x: 40, y: 30, w, d, yaw };
      const box = placedBounds(tris, itemMatrix(check.pose, place, bed));

      expect(box.min.z).toBeCloseTo(0, 3);
      expect(box.max.z).toBeCloseTo(check.size[2], 2);
      expect(box.min.x).toBeCloseTo(40, 2);
      expect(box.min.y).toBeCloseTo(30, 2);
      expect(box.max.x).toBeCloseTo(40 + w, 2);
      expect(box.max.y).toBeCloseTo(30 + d, 2);
    }
  });

  it('finds the L-bracket’s large flat face as a resting pose', () => {
    expect(shape.poses.length).toBeGreaterThan(6);
    expect(check.contactMm2).toBeGreaterThan(1000);
  });

  it('writes a 3MF whose second plate sits one plate width and a fifth along', () => {
    const matrix = itemMatrix(check.pose, { x: 10, y: 10, w: check.size[0], d: check.size[1], yaw: 0 }, bed);
    const file = writeThreeMf({
      layout: 'grid',
      plateSize: [256, 256],
      plates: [
        { number: 1, name: 'Plate 1' },
        { number: 2, name: 'Plate 2' },
      ],
      objects: [{ id: 1, name: 'L & bracket', mesh: weld(tris) }],
      items: [
        { objectId: 1, matrix, plate: 1 },
        { objectId: 1, matrix, plate: 2 },
      ],
    });
    const model = strFromU8(unzipSync(file)['3D/3dmodel.model']);
    const offsets = [...model.matchAll(/transform="([^"]+)"/g)].map((m) => Number(m[1].split(' ')[9]));

    expect(model).toContain('name="L &amp; bracket"');
    expect(offsets[1] - offsets[0]).toBeCloseTo(256 * 1.2, 3);
  });
});
