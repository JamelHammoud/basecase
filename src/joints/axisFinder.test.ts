import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findJointAxis, roundFaceAt, roundFaces } from './axisFinder';
import { MeshIndex, type V3 } from './meshIndex';

const soup = (geometry: THREE.BufferGeometry, matrix = new THREE.Matrix4()) => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;

  flat.applyMatrix4(matrix);

  return new MeshIndex(Float32Array.from(flat.getAttribute('position').array));
};

const tilted = (at: V3) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 0.25)),
    new THREE.Vector3(1, 1, 1),
  );

const angleDeg = (a: V3, b: THREE.Vector3) =>
  (Math.acos(Math.min(1, Math.abs(new THREE.Vector3(...a).normalize().dot(b.clone().normalize())))) * 180) / Math.PI;

const distance = (a: V3, b: THREE.Vector3) => new THREE.Vector3(...a).distanceTo(b);

function blockWithBore(size: number, depth: number, radius: number) {
  const shape = new THREE.Shape();

  shape.moveTo(-size / 2, -size / 2);
  shape.lineTo(size / 2, -size / 2);
  shape.lineTo(size / 2, size / 2);
  shape.lineTo(-size / 2, size / 2);
  shape.closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, radius, 0, Math.PI * 2, true));

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });

  geometry.translate(0, 0, -depth / 2);

  return geometry;
}

describe('round face axis finder', () => {
  it('fits a tessellated cylinder to within half a degree and a tenth of a millimetre', () => {
    const at: V3 = [42.5, 17, -63];
    const matrix = tilted(at);
    const index = soup(new THREE.CylinderGeometry(6, 6, 40, 32), matrix);
    const onSide = new THREE.Vector3(6 * Math.cos(0.3), 4, 6 * Math.sin(0.3)).applyMatrix4(matrix);
    const found = roundFaceAt(index, [onSide.x, onSide.y, onSide.z]);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(matrix));

    expect(found).not.toBeNull();
    expect(angleDeg(found!.axis, axis)).toBeLessThan(0.5);
    expect(distance(found!.center, new THREE.Vector3(...at))).toBeLessThan(0.1);
    expect(found!.radius).toBeCloseTo(6, 1);
    expect(found!.convex).toBe(true);
  });

  it('finds no axis on a box face', () => {
    const index = soup(new THREE.BoxGeometry(30, 20, 10));

    expect(roundFaceAt(index, [0, 0, 5])).toBeNull();
    expect(roundFaceAt(index, [15, 3, 1])).toBeNull();
    expect(roundFaces(index)).toEqual([]);
    expect(findJointAxis(index, soup(new THREE.BoxGeometry(10, 10, 10)))).toBeNull();
  });

  it('finds no axis on a cylinder cap', () => {
    const index = soup(new THREE.CylinderGeometry(6, 6, 40, 32));

    expect(roundFaceAt(index, [1, 20, 1])).toBeNull();
  });

  it('proposes the axis of a pin in a bore with no click', () => {
    const matrix = tilted([10, 30, 5]);
    const block = soup(blockWithBore(30, 12, 4.1), matrix);
    const pin = soup(new THREE.CylinderGeometry(3.9, 3.9, 40, 24).rotateX(Math.PI / 2).translate(0, 0, 6), matrix);
    const found = findJointAxis(block, pin);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(matrix));

    expect(found).not.toBeNull();
    expect(angleDeg(found!.axis, axis)).toBeLessThan(0.5);
    expect(distance(found!.origin, new THREE.Vector3(10, 30, 5))).toBeLessThan(0.1);
    expect(found!.radius).toBeCloseTo(3.9, 1);
    expect(roundFaces(block).map((c) => c.convex)).toEqual([false]);
  });

  it('gives a slider the travel that keeps the parts overlapping', () => {
    const block = soup(blockWithBore(30, 12, 4.1));
    const pin = soup(new THREE.CylinderGeometry(3.9, 3.9, 40, 24).rotateX(Math.PI / 2));
    const found = findJointAxis(block, pin)!;
    const [lo, hi] = found.travel;

    expect(lo).toBeCloseTo(-14, 1);
    expect(hi).toBeCloseTo(14, 1);
  });

  it('turns about a clicked face of either part', () => {
    const block = soup(new THREE.BoxGeometry(30, 10, 30));
    const pin = soup(new THREE.CylinderGeometry(4, 4, 20, 32).translate(0, 15, 0));
    const found = findJointAxis(block, pin, { part: 'child', point: [4, 15, 0] });

    expect(angleDeg(found!.axis, new THREE.Vector3(0, 1, 0))).toBeLessThan(0.01);
    expect(distance(found!.origin, new THREE.Vector3(0, 15, 0))).toBeLessThan(0.1);
    expect(findJointAxis(block, pin, { part: 'parent', point: [0, 5, 0] })).toBeNull();
  });

  it('skips a pair of bores that share an axis but hold no shaft', () => {
    const left = soup(blockWithBore(30, 12, 4).translate(0, 0, -6));
    const right = soup(blockWithBore(30, 12, 4).translate(0, 0, 6));

    expect(findJointAxis(left, right)).toBeNull();
  });
});
