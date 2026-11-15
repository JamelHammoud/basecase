import * as THREE from 'three';

export function cleanRecessGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const count = idx ? idx.count : pos.count;
  const p: number[] = [];
  const n: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);

    if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-12) continue;

    for (let j = 0; j < 3; j++) {
      const v = idx ? idx.getX(i + j) : i + j;

      p.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      n.push(nor.getX(v), nor.getY(v), nor.getZ(v));
    }
  }

  g.dispose();

  const out = new THREE.BufferGeometry();

  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));

  return out;
}

export function recessGroupGeometry(
  geo: THREE.BufferGeometry,
  group: { start: number; count: number },
): THREE.BufferGeometry {
  const idx = geo.index;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const p = new Float32Array(group.count * 3);
  const n = new Float32Array(group.count * 3);

  for (let i = 0; i < group.count; i++) {
    const v = idx ? idx.getX(group.start + i) : group.start + i;

    p[i * 3] = pos.getX(v);
    p[i * 3 + 1] = pos.getY(v);
    p[i * 3 + 2] = pos.getZ(v);
    n[i * 3] = nor.getX(v);
    n[i * 3 + 1] = nor.getY(v);
    n[i * 3 + 2] = nor.getZ(v);
  }

  const piece = new THREE.BufferGeometry();

  piece.setAttribute('position', new THREE.BufferAttribute(p, 3));
  piece.setAttribute('normal', new THREE.BufferAttribute(n, 3));

  return piece;
}
