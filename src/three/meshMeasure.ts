import * as THREE from 'three';

export function worldTriangles(object: THREE.Object3D): Float32Array {
  const chunks: Float32Array[] = [];

  object.updateWorldMatrix(true, true);

  const v = new THREE.Vector3();

  object.traverse((o) => {
    const mesh = o as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible) return;

    const pos = mesh.geometry?.attributes?.position;

    if (!pos) return;

    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    const out = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }

    chunks.push(out);
  });

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total - (total % 9));
  let off = 0;

  for (const c of chunks) {
    const n = Math.min(c.length - (c.length % 9), all.length - off);

    all.set(c.subarray(0, n), off);
    off += n;
  }

  return all;
}

export interface MeshMeasure {
  volumeMm3: number;
  areaMm2: number;
  min: [number, number, number];
  max: [number, number, number];
  centroid: [number, number, number];
  triangles: number;
}

function bounds(t: Float32Array) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < t.length; i++) {
    const axis = i % 3;
    const x = t[i];

    min[axis] = Math.min(min[axis], x);
    max[axis] = Math.max(max[axis], x);
  }

  return { min, max };
}

function signedSums(t: Float32Array) {
  let volume = 0;
  let area = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;

  for (let i = 0; i < t.length; i += 9) {
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

    volume += tv;
    gx += (tv * (ax + bx + cx)) / 4;
    gy += (tv * (ay + by + cy)) / 4;
    gz += (tv * (az + bz + cz)) / 4;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }

  return { volume, area, moment: [gx, gy, gz] };
}

export function measureTriangles(t: Float32Array): MeshMeasure {
  const { min, max } = bounds(t);
  const { volume, area, moment } = signedSums(t);
  const centroid = (Math.abs(volume) > 1e-6 ? moment.map((g) => g / volume) : min.map((v, a) => (v + max[a]) / 2)) as [
    number,
    number,
    number,
  ];

  return { volumeMm3: Math.abs(volume), areaMm2: area, min, max, centroid, triangles: t.length / 9 };
}

export const measureObject = (object: THREE.Object3D): MeshMeasure => measureTriangles(worldTriangles(object));
