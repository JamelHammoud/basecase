import * as THREE from 'three';

/**
 * Exact measurements of a part's rendered mesh in world space (mm): volume, surface area and
 * bounds. Shared by the BOM (filament), printability and mass checks.
 */

/** World-space triangle soup (x,y,z per vertex, 9 floats per triangle) of every visible mesh under `object` */
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
  /** Enclosed volume (signed tetrahedra; exact for closed meshes), mm³ */
  volumeMm3: number;
  areaMm2: number;
  min: [number, number, number];
  max: [number, number, number];
  /** Center of the enclosed volume (uniform density), mm */
  centroid: [number, number, number];
  triangles: number;
}

export function measureTriangles(t: Float32Array): MeshMeasure {
  let vol = 0;
  let area = 0;
  let gx = 0, gy = 0, gz = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2];
    const bx = t[i + 3], by = t[i + 4], bz = t[i + 5];
    const cx_ = t[i + 6], cy_ = t[i + 7], cz_ = t[i + 8];
    const tv = (ax * (by * cz_ - bz * cy_) - ay * (bx * cz_ - bz * cx_) + az * (bx * cy_ - by * cx_)) / 6;
    vol += tv;
    gx += (tv * (ax + bx + cx_)) / 4;
    gy += (tv * (ay + by + cy_)) / 4;
    gz += (tv * (az + bz + cz_)) / 4;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx_ - ax, wy = cy_ - ay, wz = cz_ - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    for (let k = 0; k < 9; k += 3) {
      for (let a = 0; a < 3; a++) {
        const x = t[i + k + a];
        if (x < min[a]) min[a] = x;
        if (x > max[a]) max[a] = x;
      }
    }
  }
  // Open or degenerate meshes have no enclosed volume: fall back to the bounds center
  const centroid: [number, number, number] =
    Math.abs(vol) > 1e-6 ? [gx / vol, gy / vol, gz / vol] : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { volumeMm3: Math.abs(vol), areaMm2: area, min, max, centroid, triangles: t.length / 9 };
}

export const measureObject = (object: THREE.Object3D): MeshMeasure => measureTriangles(worldTriangles(object));
