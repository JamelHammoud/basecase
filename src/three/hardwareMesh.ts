import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import {
  BEARINGS,
  CROSS_RECESS,
  HEAT_INSERT,
  HEX_BOLT,
  HEX_NUT,
  HardwareSpec,
  LARGE_WASHER,
  LOCK_NUT,
  MetricSize,
  TORX_RECESS,
  SQUARE_NUT,
  STANDOFF,
  ScrewRecess,
  THREAD,
  WASHER,
  hardwareDimensions,
  screwHead,
  setScrewRecess,
} from '../data/hardware';

export interface HardwareMaterials {
  main: THREE.Material;
  dark: THREE.Material;
  nylon: THREE.Material;
}

export interface HardwarePiece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Draw CAD edges (off for threads, which would be all lines) */
  edges: boolean;
}

/* ---------------------------- primitives ---------------------------- */

/** Threaded shank along +Y from y0, as a lathe of a sawtooth profile (reads as thread at any zoom). */
function thread(d: number, pitch: number, length: number, y0: number): THREE.BufferGeometry {
  const rc = d / 2;
  const rr = Math.max(0.2, rc - 0.54 * pitch);
  // Keep ring count sane on long, fine-pitch screws
  const p = Math.max(pitch, length / 120);
  const chamfer = Math.min(p * 0.8, length * 0.2);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(rr, 0), new THREE.Vector2(rc, chamfer)];
  for (let y = chamfer + p / 2; y < length - p / 2; y += p) {
    pts.push(new THREE.Vector2(rr, y));
    pts.push(new THREE.Vector2(rc, Math.min(length, y + p / 2)));
  }
  pts.push(new THREE.Vector2(rc, length), new THREE.Vector2(0, length));
  const g = new THREE.LatheGeometry(pts, 28);
  g.translate(0, y0, 0);
  return g;
}

/** Plain revolved profile ([radius, y] pairs) */
function lathe(profile: Array<[number, number]>, segments = 40): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segments);
}

function polygonShape(radius: number, sides: number, angle0 = 0): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= sides; i++) {
    const a = angle0 + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

function holePath(r: number, sides = 32, angle0 = 0): THREE.Path {
  const p = new THREE.Path();
  for (let i = 0; i <= sides; i++) {
    const a = angle0 - (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  return p;
}

/** Extrudes a 2D shape (XY) upward along +Y from y0 */
function prism(shape: THREE.Shape, height: number, y0: number, bevel = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 32,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

const hexRadius = (s: number) => s / Math.sqrt(3);

type Recess = ScrewRecess;

/** Outline of a drive recess in the XY plane, centered on the screw axis */
function recessShape(recess: Recess, headDia: number): THREE.Shape {
  if (recess.kind === 'hex') return polygonShape(hexRadius(recess.s), 6, Math.PI / 6);
  if (recess.kind === 'torx') {
    // ISO 10664 hexalobular: lobes between the point-to-point A and across-lobes B circles
    const { A, B } = TORX_RECESS[recess.size] ?? { A: headDia * 0.4, B: headDia * 0.3 };
    const shape = new THREE.Shape();
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = (A + B) / 4 + ((A - B) / 4) * Math.cos(6 * a);
      if (i === 0) shape.moveTo(r * Math.cos(a), r * Math.sin(a));
      else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    return shape;
  }
  const shape = new THREE.Shape();
  if (recess.kind === 'phillips' || recess.kind === 'pozidriv') {
    // ISO 4757 cross: two wings of width m/6 across the recess width m
    const m = CROSS_RECESS[recess.size]?.m ?? headDia * 0.5;
    const h = m / 2;
    const q = m / 12;
    // Pozidriv (type Z) adds a short rib on each diagonal, between the wings
    const tick = recess.kind === 'pozidriv' ? { T: m * 0.26, d: m * 0.025 } : null;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) {
      // One wing and the corner after it, rotated a quarter turn each time
      const quarter: Array<[number, number]> = [[h, -q], [h, q]];
      if (tick) {
        const { T, d } = tick;
        quarter.push([q + 2 * d, q], [T + d, T - d], [T - d, T + d], [q, q + 2 * d]);
      } else quarter.push([q, q]);
      const c = Math.cos((i * Math.PI) / 2);
      const sn = Math.sin((i * Math.PI) / 2);
      for (const [x, z] of quarter) pts.push([x * c - z * sn, x * sn + z * c]);
    }
    pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  } else {
    // Slot runs past both sides of the head
    const w = recess.width / 2;
    const l = headDia / 2 + 1;
    shape.moveTo(-l, -w);
    shape.lineTo(l, -w);
    shape.lineTo(l, w);
    shape.lineTo(-l, w);
  }
  shape.closePath();
  return shape;
}

/**
 * Tool body for a recess: from `depth` below the head top `y` to 1 mm above it (so it clears
 * domed heads). A Phillips or Pozidriv cross tapers toward its tip like the real cone.
 */
function recessCutter(recess: Recess, y: number, depth: number, headDia: number): THREE.BufferGeometry {
  const g = prism(recessShape(recess, headDia), depth + 1, y - depth);
  if (recess.kind === 'phillips' || recess.kind === 'pozidriv') {
    // Pozidriv wings are straighter-sided than Phillips, so its cone tapers less
    const taper = recess.kind === 'pozidriv' ? 0.6 : 0.75;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const below = Math.max(0, y - pos.getY(i)) / depth; // 0 at the top face, 1 at the tip
      const f = 1 - taper * below;
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
    }
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Recess depth below the head top, from the minimum key engagement t in each head standard
 * (ISO 4762 / 7380 / 10642 / 14579 / 14581 / 14583 / 1580 / 2009). Phillips and Pozidriv use the
 * ISO 4757 gauge depth, which runs into the shank like the real cone.
 */
function recessDepth(type: HardwareSpec['type'], recess: Recess, k: number): number {
  if (recess.kind === 'phillips' || recess.kind === 'pozidriv') {
    const depth = CROSS_RECESS[recess.size]?.depth ?? k * 0.6;
    // Only a countersunk head lets the cone run on into the shank; in other heads it stops inside
    return type === 'countersunk' ? depth : Math.min(depth, k * 0.8);
  }
  if (recess.kind === 'slot') return k * 0.4;
  if (type === 'socket_head') return k * (recess.kind === 'hex' ? 0.5 : 0.45);
  if (type === 'pan_head') return k * 0.42;
  return k * (recess.kind === 'hex' ? 0.6 : 0.55);
}

/** Position + normal only, without the zero-area triangles lathes leave at their poles (they break CSG) */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const p: number[] = [];
  const n: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-12) continue;
    for (let j = 0; j < 3; j++) {
      p.push(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j));
      n.push(nor.getX(i + j), nor.getY(i + j), nor.getZ(i + j));
    }
  }
  if (src !== g) src.dispose();
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return out;
}

const csg = new Evaluator();
csg.attributes = ['position', 'normal'];
csg.useGroups = true;

/**
 * Cuts the recess out of a head (or set screw) for real. The new walls and floor come back
 * as a dark piece, so the recess reads at any zoom.
 */
function cutRecess(
  add: (g: THREE.BufferGeometry, material?: THREE.Material, edges?: boolean) => void,
  m: HardwareMaterials,
  head: THREE.BufferGeometry,
  cutter: THREE.BufferGeometry,
  edges = true
): void {
  const a = new Brush(clean(head), m.main);
  const b = new Brush(clean(cutter), m.dark);
  a.updateMatrixWorld();
  b.updateMatrixWorld();
  const result = csg.evaluate(a, b, SUBTRACTION);
  const geo = result.geometry;
  const mats = (Array.isArray(result.material) ? result.material : [result.material]) as THREE.Material[];
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  // Split the result by material group into one plain geometry per piece
  for (const group of geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }]) {
    const idx = geo.index;
    const p = new Float32Array(group.count * 3);
    const n = new Float32Array(group.count * 3);
    for (let i = 0; i < group.count; i++) {
      const v = idx ? idx.getX(group.start + i) : group.start + i;
      p.set([pos.getX(v), pos.getY(v), pos.getZ(v)], i * 3);
      n.set([nor.getX(v), nor.getY(v), nor.getZ(v)], i * 3);
    }
    const piece = new THREE.BufferGeometry();
    piece.setAttribute('position', new THREE.BufferAttribute(p, 3));
    piece.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    const isRecess = mats[group.materialIndex ?? 0] === m.dark;
    add(piece, isRecess ? m.dark : m.main, edges && !isRecess);
  }
  a.geometry.dispose();
  b.geometry.dispose();
  geo.dispose();
}

/* ------------------------------ builder ----------------------------- */

/**
 * Pieces for one hardware item, centered on its bounding box (Y = axis,
 * screws head-up), matching `hardwareDimensions(spec)` exactly.
 */
export function buildHardwarePieces(spec: HardwareSpec, m: HardwareMaterials): HardwarePiece[] {
  const size = spec.size as MetricSize;
  const L = spec.length ?? 0;
  const pieces: HardwarePiece[] = [];
  const add = (geometry: THREE.BufferGeometry, material = m.main, edges = true) =>
    pieces.push({ geometry, material, edges });

  switch (spec.type) {
    case 'socket_head': {
      const { dk, k, recess } = screwHead(spec)!;
      const t = THREAD[size];
      add(thread(t.d, t.pitch, L, 0), m.main, false);
      const head = prism(circleShape(dk / 2), k, L, Math.min(0.25, k * 0.06));
      cutRecess(add, m, head, recessCutter(recess, L + k, recessDepth(spec.type, recess, k), dk));
      break;
    }
    case 'pan_head': {
      const { dk, k, recess } = screwHead(spec)!;
      const t = THREAD[size];
      add(thread(t.d, t.pitch, L, 0), m.main, false);
      // ISO 7045/14583: straight side, then a domed top; ISO 1580 (slotted): flatter top
      const side = recess.kind === 'slot' ? 0.75 : 0.5;
      const prof: Array<[number, number]> = [[0, L], [dk / 2, L], [dk / 2, L + k * side]];
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        prof.push([i === 8 ? 0 : (dk / 2) * Math.cos(a), L + k * side + k * (1 - side) * Math.sin(a)]);
      }
      cutRecess(add, m, lathe(prof), recessCutter(recess, L + k, recessDepth(spec.type, recess, k), dk));
      break;
    }
    case 'button_head': {
      const { dk, k, recess } = screwHead(spec)!;
      const t = THREAD[size];
      add(thread(t.d, t.pitch, L, 0), m.main, false);
      const prof: Array<[number, number]> = [[0, L]];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * (Math.PI / 2);
        prof.push([(dk / 2) * Math.cos(a * 0.82), L + k * Math.sin(a)]);
      }
      prof.push([0, L + k]);
      cutRecess(add, m, lathe(prof), recessCutter(recess, L + k, recessDepth(spec.type, recess, k), dk));
      break;
    }
    case 'countersunk': {
      const { dk, k, recess } = screwHead(spec)!;
      const t = THREAD[size];
      // The Phillips cone runs past the head into the shank, so cut head and shank core together
      const depth = recessDepth(spec.type, recess, k);
      const core = Math.max(0, Math.min(L - k, depth - k + 0.5));
      add(thread(t.d, t.pitch, L - k - core, 0), m.main, false);
      const headProfile: Array<[number, number]> = [
        [0, L - k - core],
        [t.d / 2, L - k - core],
        [t.d / 2, L - k],
        [dk / 2, L - 0.15],
        [dk / 2, L],
        [0, L],
      ];
      cutRecess(add, m, lathe(headProfile), recessCutter(recess, L, depth, dk));
      break;
    }
    case 'hex_bolt': {
      const { s, k } = HEX_BOLT[size]!;
      const t = THREAD[size];
      add(thread(t.d, t.pitch, L, 0), m.main, false);
      add(prism(polygonShape(hexRadius(s), 6), k, L, Math.min(0.3, k * 0.08)));
      break;
    }
    case 'set_screw': {
      const t = THREAD[size];
      const { recess, depth } = setScrewRecess(spec)!;
      cutRecess(add, m, thread(t.d, t.pitch, L, 0), recessCutter(recess, L, depth, t.d), false);
      break;
    }
    case 'hex_nut':
    case 'lock_nut': {
      const isLock = spec.type === 'lock_nut';
      const s = isLock ? LOCK_NUT[size]!.s : HEX_NUT[size]!.s;
      const total = isLock ? LOCK_NUT[size]!.h : HEX_NUT[size]!.m;
      const metal = isLock ? total * 0.72 : total;
      const body = polygonShape(hexRadius(s), 6);
      body.holes.push(holePath(THREAD[size].d / 2));
      add(prism(body, metal, 0, Math.min(0.25, metal * 0.08)));
      if (isLock) {
        const ring = circleShape((s * 0.9) / 2);
        ring.holes.push(holePath(THREAD[size].d / 2));
        add(prism(ring, total - metal, metal), m.nylon);
      }
      break;
    }
    case 'square_nut': {
      const { s, m: h } = SQUARE_NUT[size]!;
      const sq = polygonShape((s / 2) * Math.SQRT2, 4, Math.PI / 4);
      sq.holes.push(holePath(THREAD[size].d / 2));
      add(prism(sq, h, 0));
      break;
    }
    case 'washer':
    case 'large_washer': {
      const w = (spec.type === 'washer' ? WASHER : LARGE_WASHER)[size]!;
      const ring = circleShape(w.d2 / 2);
      ring.holes.push(holePath(w.d1 / 2));
      add(prism(ring, w.h, 0));
      break;
    }
    case 'heat_insert': {
      const { od, l } = HEAT_INSERT[size]!;
      const ro = od / 2;
      const rk = ro - Math.max(0.2, od * 0.06);
      const ri = THREAD[size].d / 2;
      // Closed revolved section: bore, then three knurled bands on the outside
      const prof: Array<[number, number]> = [[ri, 0], [rk, 0]];
      const bands = 3;
      for (let b = 0; b < bands; b++) {
        const y0 = (l / bands) * b;
        const y1 = (l / bands) * (b + 1);
        prof.push([rk, y0 + 0.1], [ro, y0 + (y1 - y0) * 0.25], [ro, y0 + (y1 - y0) * 0.75], [rk, y1 - 0.05]);
      }
      prof.push([rk, l], [ri, l], [ri, 0]);
      const g = lathe(prof, 24);
      g.computeVertexNormals();
      add(g);
      break;
    }
    case 'standoff_mf':
    case 'standoff_ff': {
      const { s, male } = STANDOFF[size]!;
      const t = THREAD[size];
      const y0 = spec.type === 'standoff_mf' ? male : 0;
      if (spec.type === 'standoff_mf') add(thread(t.d, t.pitch, male, 0), m.main, false);
      const body = polygonShape(hexRadius(s), 6);
      body.holes.push(holePath(t.d / 2));
      add(prism(body, L, y0, 0.15));
      break;
    }
    case 'dowel_pin': {
      const r = Number(spec.size) / 2;
      const c = Math.min(0.4, r * 0.25);
      add(lathe([[0, 0], [r - c, 0], [r, c], [r, L - c], [r - c, L], [0, L]]));
      break;
    }
    case 'bearing': {
      const { d, D, B } = BEARINGS[spec.size];
      const wall = (D - d) * 0.17;
      const outer = circleShape(D / 2);
      outer.holes.push(holePath(D / 2 - wall, 48));
      add(prism(outer, B, 0, Math.min(0.2, B * 0.04)));
      const inner = circleShape(d / 2 + wall);
      inner.holes.push(holePath(d / 2, 40));
      add(prism(inner, B, 0, Math.min(0.2, B * 0.04)));
      const shield = circleShape(D / 2 - wall);
      shield.holes.push(holePath(d / 2 + wall, 48));
      add(prism(shield, B * 0.9, B * 0.05), m.dark, false);
      break;
    }
  }

  // Center on the bounding box so position = center, like every other part
  const height = hardwareDimensions(spec).height;
  for (const p of pieces) p.geometry.translate(0, -height / 2, 0);
  return pieces;
}
