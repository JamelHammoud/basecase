import * as THREE from 'three';

export interface Interference {
  a: string;
  b: string;
  depthMm: number;
  fraction: number;
}

export interface Coplanar {
  a: string;
  b: string;
  areaMm2: number;
}

export function worldGeometry(object: THREE.Object3D): THREE.BufferGeometry | null {
  const chunks: Float32Array[] = [];

  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return;

    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()) as THREE.BufferGeometry;

    g.applyMatrix4(mesh.matrixWorld);
    chunks.push(g.attributes.position.array as Float32Array);
    g.dispose();
  });

  const total = chunks.reduce((n, c) => n + c.length, 0);

  if (total < 9) return null;

  const all = new Float32Array(total);
  let off = 0;

  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }

  const geom = new THREE.BufferGeometry();

  geom.setAttribute('position', new THREE.BufferAttribute(all, 3));

  return geom;
}
