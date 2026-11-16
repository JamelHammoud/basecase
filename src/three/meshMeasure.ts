import * as THREE from 'three';
import type { SheetProfile } from '../types/sheet';

export function worldTriangles(object: THREE.Object3D): Float32Array {
  const meshes: THREE.Mesh[] = [];
  let total = 0;

  object.updateWorldMatrix(true, true);

  object.traverse((o) => {
    const mesh = o as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible) return;

    const pos = mesh.geometry?.attributes?.position;

    if (!pos) return;

    total += (mesh.geometry.index?.count ?? pos.count) * 3;
    meshes.push(mesh);
  });

  const all = new Float32Array(total - (total % 9));
  const v = new THREE.Vector3();
  let off = 0;

  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index?.count ?? pos.count;
    const complete = count - (count % 3);

    for (let i = 0; i < complete; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      all[off++] = v.x;
      all[off++] = v.y;
      all[off++] = v.z;
    }
  }

  return all;
}

const UNIT = new THREE.Vector3(1, 1, 1);

export function rigidFrame(object: THREE.Object3D) {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();

  object.matrixWorld.decompose(t, q, new THREE.Vector3());

  return { t, q, matrix: new THREE.Matrix4().compose(t, q, UNIT) };
}

export function localTriangles(object: THREE.Object3D): Float32Array {
  const triangles = worldTriangles(object);
  const inverse = rigidFrame(object).matrix.invert();
  const v = new THREE.Vector3();

  for (let i = 0; i < triangles.length; i += 3) {
    v.fromArray(triangles, i).applyMatrix4(inverse).toArray(triangles, i);
  }

  return triangles;
}

export interface MeshMeasure {
  sheet?: SheetProfile;
  volumeMm3: number;
  areaMm2: number;
  min: [number, number, number];
  max: [number, number, number];
  centroid: [number, number, number];
  triangles: number;
  base?: Array<[number, number]>;
}

function triangleSums(t: Float32Array) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const complete = t.length - (t.length % 9);
  let volume = 0;
  let area = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;

  for (let i = 0; i < complete; i += 9) {
    const ax = t[i];
    const ay = t[i + 1];
    const az = t[i + 2];
    const bx = t[i + 3];
    const by = t[i + 4];
    const bz = t[i + 5];
    const cx = t[i + 6];
    const cy = t[i + 7];
    const cz = t[i + 8];
    const tv = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;

    min[0] = Math.min(min[0], ax, bx, cx);
    min[1] = Math.min(min[1], ay, by, cy);
    min[2] = Math.min(min[2], az, bz, cz);
    max[0] = Math.max(max[0], ax, bx, cx);
    max[1] = Math.max(max[1], ay, by, cy);
    max[2] = Math.max(max[2], az, bz, cz);
    volume += tv;
    gx += (tv * (ax + bx + cx)) / 4;
    gy += (tv * (ay + by + cy)) / 4;
    gz += (tv * (az + bz + cz)) / 4;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }

  for (let i = complete; i < t.length; i++) {
    const axis = i % 3;
    const value = t[i];

    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }

  return {
    min,
    max,
    volume: complete === t.length ? volume : NaN,
    area: complete === t.length ? area : NaN,
    moment: [gx, gy, gz],
  };
}

export function measureTriangles(t: Float32Array): MeshMeasure {
  const { min, max, volume, area, moment } = triangleSums(t);
  const centroid = (Math.abs(volume) > 1e-6 ? moment.map((g) => g / volume) : min.map((v, a) => (v + max[a]) / 2)) as [
    number,
    number,
    number,
  ];

  return { volumeMm3: Math.abs(volume), areaMm2: area, min, max, centroid, triangles: t.length / 9 };
}

export const measureObject = (object: THREE.Object3D): MeshMeasure => measureTriangles(worldTriangles(object));
