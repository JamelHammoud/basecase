import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';

export function parseStl(buf) {
  const isAscii =
    buf.subarray(0, 5).toString('utf8') === 'solid' &&
    buf.toString('utf8', 0, Math.min(buf.length, 400)).includes('facet');

  if (isAscii) {
    const nums = [...buf.toString('utf8').matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [
      +m[1],
      +m[2],
      +m[3],
    ]);

    return new Float32Array(nums);
  }

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  const out = new Float32Array(n * 9);

  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;

    for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(base + k * 4, true);
  }

  return out;
}

export function writeBinaryStl(file, tris) {
  const n = tris.length / 9;
  const buf = Buffer.alloc(84 + n * 50);

  buf.write('basecase bench', 0);
  buf.writeUInt32LE(n, 80);

  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;

    for (let k = 0; k < 9; k++) buf.writeFloatLE(tris[i * 9 + k], base + k * 4);
  }

  fs.writeFileSync(file, buf);
}

export function boundsOf(tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (tris[i + k] < min[k]) min[k] = tris[i + k];

      if (tris[i + k] > max[k]) max[k] = tris[i + k];
    }
  }

  return { min, max, size: max.map((v, i) => v - min[i]) };
}

export function parseXml(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;

  while ((m = re.exec(xml))) {
    if (m[1]) {
      stack.pop();

      continue;
    }

    if (!m[2]) continue;

    const attrs = {};

    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[2] ?? a[3];

    const node = { tag: m[2], attrs, children: [] };

    stack[stack.length - 1].children.push(node);

    if (!m[4]) stack.push(node);
  }

  return root;
}

const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
const kid = (n, tag) => n.children.find((c) => c.tag === tag);
const nums = (s, def) => (s ? s.trim().split(/\s+/).map(Number) : def);

function originMatrix(node) {
  const o = node && kid(node, 'origin');
  const [x, y, z] = nums(o?.attrs.xyz, [0, 0, 0]);
  const [r, p, yw] = nums(o?.attrs.rpy, [0, 0, 0]);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r, p, yw, 'ZYX'));

  m.setPosition(x, y, z);

  return m;
}

export function assembleUrdf(xml, resolveMesh, pose = {}) {
  const robot = kid(parseXml(xml), 'robot');
  const links = new Map(kids(robot, 'link').map((l) => [l.attrs.name, l]));
  const joints = kids(robot, 'joint');
  const childOf = new Map(joints.map((j) => [kid(j, 'child').attrs.link, j]));
  const world = new Map();
  const worldOf = (name) => {
    if (world.has(name)) return world.get(name);

    const j = childOf.get(name);
    const m = j ? worldOf(kid(j, 'parent').attrs.link).clone().multiply(originMatrix(j)) : new THREE.Matrix4();

    if (j && pose[j.attrs.name]) {
      const axis = new THREE.Vector3(...nums(kid(j, 'axis')?.attrs.xyz, [1, 0, 0])).normalize();

      m.multiply(new THREE.Matrix4().makeRotationAxis(axis, pose[j.attrs.name]));
    }

    world.set(name, m);

    return m;
  };
  const meshCache = new Map();
  const out = [];
  let parts = 0;
  const v = new THREE.Vector3();

  for (const [name, link] of links) {
    for (const visual of kids(link, 'visual')) {
      const mesh = kid(kid(visual, 'geometry') ?? { children: [] }, 'mesh');

      if (!mesh) continue;

      const file = resolveMesh(mesh.attrs.filename);

      if (!file) continue;

      if (!meshCache.has(file)) meshCache.set(file, parseStl(fs.readFileSync(file)));

      const tris = meshCache.get(file);
      const [sx, sy, sz] = nums(mesh.attrs.scale, [1, 1, 1]);
      const m = worldOf(name)
        .clone()
        .multiply(originMatrix(visual))
        .multiply(new THREE.Matrix4().makeScale(sx, sy, sz));

      for (let i = 0; i < tris.length; i += 3) {
        v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m);
        out.push(v.x * 1000, v.y * 1000, v.z * 1000);
      }

      parts++;
    }
  }

  const triangles = new Float32Array(out);

  return { triangles, parts, bounds: boundsOf(triangles) };
}

export function skeletonFromMjcf(xml) {
  const root = kid(kid(parseXml(xml), 'mujoco'), 'worldbody');
  const points = [];
  const walk = (node, parent) => {
    for (const body of kids(node, 'body')) {
      const [x, y, z] = nums(body.attrs.pos, [0, 0, 0]);
      const [w, qx, qy, qz] = nums(body.attrs.quat, [1, 0, 0, 0]);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(qx, qy, qz, w),
        new THREE.Vector3(1, 1, 1),
      );
      const wm = parent.clone().multiply(m);
      const p = new THREE.Vector3().setFromMatrixPosition(wm);
      const joint = kid(body, 'joint')?.attrs.name ?? kid(body, 'freejoint')?.attrs.name ?? body.attrs.name;

      points.push({ body: body.attrs.name, joint, pos: [p.x * 1000, p.y * 1000, p.z * 1000] });
      walk(body, wm);
    }
  };

  walk(root, new THREE.Matrix4());

  const flat = new Float32Array(points.flatMap((p) => p.pos));

  return { points, bounds: boundsOf(flat) };
}

const VIEW_AXES = { front: [0, 2], side: [1, 2] };

const insideTriangle = (w0, w1, w2) => (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);

function stampPoints(mask, xs, ys, { w, h }) {
  for (let k = 0; k < 3; k++) {
    const px = Math.round(xs[k]),
      py = Math.round(ys[k]);

    if (px >= 0 && px < w && py >= 0 && py < h) mask[py * w + px] = 1;
  }
}

function fillTriangle(mask, xs, ys, { w, h }) {
  const x0 = Math.max(0, Math.floor(Math.min(...xs))),
    x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))),
    y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5,
        cy = py + 0.5;
      const w0 = (xs[1] - cx) * (ys[2] - cy) - (xs[2] - cx) * (ys[1] - cy);
      const w1 = (xs[2] - cx) * (ys[0] - cy) - (xs[0] - cx) * (ys[2] - cy);
      const w2 = (xs[0] - cx) * (ys[1] - cy) - (xs[1] - cx) * (ys[0] - cy);

      if (insideTriangle(w0, w1, w2)) mask[py * w + px] = 1;
    }
  }
}

export function silhouette(tris, view, grid) {
  const { min, cell, w, h } = grid;
  const [a, b] = VIEW_AXES[view] ?? [0, 1];
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < tris.length; i += 9) {
    const xs = [tris[i + a], tris[i + 3 + a], tris[i + 6 + a]].map((v) => (v - min[a]) / cell);
    const ys = [tris[i + b], tris[i + 3 + b], tris[i + 6 + b]].map((v) => (v - min[b]) / cell);
    const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);

    if (Math.abs(area) < 1e-9) stampPoints(mask, xs, ys, { w, h });
    else fillTriangle(mask, xs, ys, { w, h });
  }

  return mask;
}

export function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);

  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, (h - 1 - y) * w * 3, (h - y) * w * 3);
  }

  const crc = (buf) => {
    let c = ~0;

    for (const byte of buf) {
      c ^= byte;

      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }

    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);

    len.writeUInt32BE(data.length);

    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);

    c.writeUInt32BE(crc(td));

    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
