import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { CROSS_RECESS, HardwareSpec, ScrewRecess, TORX_RECESS } from '../data/hardware';
import { hexRadius, polygonShape, prism } from './hardwarePrimitives';

type CrossRecess = Extract<ScrewRecess, { kind: 'phillips' | 'pozidriv' }>;

export type AddPiece = (g: THREE.BufferGeometry, material?: THREE.Material, edges?: boolean) => void;

export interface RecessMaterials {
  main: THREE.Material;
  dark: THREE.Material;
}

export interface RecessCut {
  head: THREE.BufferGeometry;
  cutter: THREE.BufferGeometry;
  edges?: boolean;
}

const isCross = (recess: ScrewRecess): recess is CrossRecess =>
  recess.kind === 'phillips' || recess.kind === 'pozidriv';

function shapeFromPoints(pts: Array<[number, number]>): THREE.Shape {
  const shape = new THREE.Shape();

  pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));

  return shape;
}

function torxShape(size: string, headDia: number): THREE.Shape {
  const { A, B } = TORX_RECESS[size] ?? { A: headDia * 0.4, B: headDia * 0.3 };
  const n = 72;
  const pts: Array<[number, number]> = [];

  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = (A + B) / 4 + ((A - B) / 4) * Math.cos(6 * a);

    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }

  return shapeFromPoints(pts);
}

function crossQuarter(m: number, pozidriv: boolean): Array<[number, number]> {
  const h = m / 2;
  const q = m / 12;
  const quarter: Array<[number, number]> = [
    [h, -q],
    [h, q],
  ];

  if (!pozidriv) {
    quarter.push([q, q]);

    return quarter;
  }

  const T = m * 0.26;
  const d = m * 0.025;

  quarter.push([q + 2 * d, q], [T + d, T - d], [T - d, T + d], [q, q + 2 * d]);

  return quarter;
}

function crossShape(recess: CrossRecess, headDia: number): THREE.Shape {
  const m = CROSS_RECESS[recess.size]?.m ?? headDia * 0.5;
  const quarter = crossQuarter(m, recess.kind === 'pozidriv');
  const pts: Array<[number, number]> = [];

  for (let i = 0; i < 4; i++) {
    const c = Math.cos((i * Math.PI) / 2);
    const sn = Math.sin((i * Math.PI) / 2);

    for (const [x, z] of quarter) pts.push([x * c - z * sn, x * sn + z * c]);
  }

  const shape = shapeFromPoints(pts);

  shape.closePath();

  return shape;
}

function slotShape(width: number, headDia: number): THREE.Shape {
  const w = width / 2;
  const l = headDia / 2 + 1;
  const shape = shapeFromPoints([
    [-l, -w],
    [l, -w],
    [l, w],
    [-l, w],
  ]);

  shape.closePath();

  return shape;
}

function recessShape(recess: ScrewRecess, headDia: number): THREE.Shape {
  if (recess.kind === 'hex') return polygonShape(hexRadius(recess.s), 6, Math.PI / 6);

  if (recess.kind === 'torx') return torxShape(recess.size, headDia);

  if (isCross(recess)) return crossShape(recess, headDia);

  return slotShape(recess.width, headDia);
}

export function recessCutter(recess: ScrewRecess, y: number, depth: number, headDia: number): THREE.BufferGeometry {
  const g = prism(recessShape(recess, headDia), depth + 1, y - depth);

  if (!isCross(recess)) return g;

  const taper = recess.kind === 'pozidriv' ? 0.6 : 0.75;
  const pos = g.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const below = Math.max(0, y - pos.getY(i)) / depth;
    const f = 1 - taper * below;

    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
  }

  g.computeVertexNormals();

  return g;
}

export function recessDepth(type: HardwareSpec['type'], recess: ScrewRecess, k: number): number {
  if (isCross(recess)) {
    const depth = CROSS_RECESS[recess.size]?.depth ?? k * 0.6;

    return type === 'countersunk' ? depth : Math.min(depth, k * 0.8);
  }

  if (recess.kind === 'slot') return k * 0.4;

  const isHex = recess.kind === 'hex';

  if (type === 'socket_head') return k * (isHex ? 0.5 : 0.45);

  if (type === 'pan_head') return k * 0.42;

  return k * (isHex ? 0.6 : 0.55);
}

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

function groupGeometry(geo: THREE.BufferGeometry, group: { start: number; count: number }): THREE.BufferGeometry {
  const idx = geo.index;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
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

  return piece;
}

export function cutRecess(add: AddPiece, m: RecessMaterials, { head, cutter, edges = true }: RecessCut): void {
  const a = new Brush(clean(head), m.main);
  const b = new Brush(clean(cutter), m.dark);

  a.updateMatrixWorld();
  b.updateMatrixWorld();

  const result = csg.evaluate(a, b, SUBTRACTION);
  const geo = result.geometry;
  const mats = (Array.isArray(result.material) ? result.material : [result.material]) as THREE.Material[];
  const groups = geo.groups.length
    ? geo.groups
    : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];

  for (const group of groups) {
    const isRecess = mats[group.materialIndex ?? 0] === m.dark;

    add(groupGeometry(geo, group), isRecess ? m.dark : m.main, edges && !isRecess);
  }

  a.geometry.dispose();
  b.geometry.dispose();
  geo.dispose();
}
