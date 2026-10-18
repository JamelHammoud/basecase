/**
 * Reads a binary glTF (the catalog's component meshes) into a triangle soup in the bench
 * frame (mm, Z up, front −Y). Catalog meshes are in the studio frame (Y up), so
 * bench = (x, −z, y).
 */
import fs from 'node:fs';
import * as THREE from 'three';

export function readGlbTriangles(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB file');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
    else if (type === 'BIN\0') bin = data;
    off += 8 + len;
  }
  const view = (accIndex) => {
    const acc = json.accessors[accIndex];
    const bv = json.bufferViews[acc.bufferView];
    const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[acc.componentType];
    const stride = bv.byteStride ?? 0;
    const n = acc.count * comps;
    if (!stride || stride === comps * Ctor.BYTES_PER_ELEMENT) {
      return new Ctor(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + n * Ctor.BYTES_PER_ELEMENT));
    }
    const out = new Ctor(n);
    const dv = new DataView(bin.buffer, bin.byteOffset);
    for (let i = 0; i < acc.count; i++) for (let k = 0; k < comps; k++) out[i * comps + k] = dv.getFloat32(start + i * stride + k * 4, true);
    return out;
  };
  const out = [];
  const v = new THREE.Vector3();
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new THREE.Vector3(...(node.translation ?? [0, 0, 0])), new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const pos = view(prim.attributes.POSITION);
        const idx = prim.indices !== undefined ? view(prim.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        for (let i = 0; i < count; i++) {
          const j = idx ? idx[i] : i;
          v.set(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]).applyMatrix4(world);
          out.push(v.x, -v.z, v.y);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  for (const n of json.scenes[json.scene ?? 0].nodes) visit(n, new THREE.Matrix4());
  return new Float32Array(out);
}
