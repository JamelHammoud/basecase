import * as THREE from 'three';
import {
  BEARINGS,
  heatInsert,
  HEX_BOLT,
  HEX_NUT,
  HardwareSpec,
  HardwareType,
  LARGE_WASHER,
  LOCK_NUT,
  MetricSize,
  SQUARE_NUT,
  STANDOFF,
  THREAD,
  WASHER,
  hardwareDimensions,
  screwHead,
  setScrewRecess,
} from '../data/hardware';
import { circleShape, hexRadius, holePath, lathe, polygonShape, prism, thread } from './hardwarePrimitives';
import { AddPiece, cutRecess, recessCutter, recessDepth } from './hardwareRecess';
import { BEARING_BUILDERS } from './bearingMesh';
import { DRIVE_BUILDERS } from './driveMesh';
import { FRAME_BUILDERS } from './frameMesh';
import { MOTION_BUILDERS } from './motionHardwareMesh';

export interface HardwareMaterials {
  main: THREE.Material;
  dark: THREE.Material;
  nylon: THREE.Material;
}

export interface HardwarePiece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  edges: boolean;
}

export interface BuildContext {
  spec: HardwareSpec;
  size: MetricSize;
  L: number;
  m: HardwareMaterials;
  add: AddPiece;
}

function headedScrew(
  { spec, size, L, m, add }: BuildContext,
  headProfile: (dk: number, k: number) => THREE.BufferGeometry,
) {
  const { dk, k, recess } = screwHead(spec)!;
  const t = THREAD[size];

  add(thread(t.d, t.pitch, L, 0), m.main, false);
  cutRecess(add, m, {
    head: headProfile(dk, k),
    cutter: recessCutter(recess, L + k, recessDepth(spec.type, recess, k), dk),
  });
}

function socketHead(ctx: BuildContext) {
  headedScrew(ctx, (dk, k) => prism(circleShape(dk / 2), k, ctx.L, Math.min(0.25, k * 0.06)));
}

function panHead(ctx: BuildContext) {
  const { L } = ctx;
  const side = screwHead(ctx.spec)!.recess.kind === 'slot' ? 0.75 : 0.5;

  headedScrew(ctx, (dk, k) => {
    const prof: Array<[number, number]> = [
      [0, L],
      [dk / 2, L],
      [dk / 2, L + k * side],
    ];

    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);

      prof.push([i === 8 ? 0 : (dk / 2) * Math.cos(a), L + k * side + k * (1 - side) * Math.sin(a)]);
    }

    return lathe(prof);
  });
}

function buttonHead(ctx: BuildContext) {
  const { L } = ctx;

  headedScrew(ctx, (dk, k) => {
    const prof: Array<[number, number]> = [[0, L]];

    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);

      prof.push([(dk / 2) * Math.cos(a * 0.82), L + k * Math.sin(a)]);
    }

    prof.push([0, L + k]);

    return lathe(prof);
  });
}

function countersunk({ spec, size, L, m, add }: BuildContext) {
  const { dk, k, recess } = screwHead(spec)!;
  const t = THREAD[size];
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

  cutRecess(add, m, { head: lathe(headProfile), cutter: recessCutter(recess, L, depth, dk) });
}

function hexBolt({ size, L, m, add }: BuildContext) {
  const { s, k } = HEX_BOLT[size]!;
  const t = THREAD[size];

  add(thread(t.d, t.pitch, L, 0), m.main, false);
  add(prism(polygonShape(hexRadius(s), 6), k, L, Math.min(0.3, k * 0.08)));
}

function setScrew({ spec, size, L, m, add }: BuildContext) {
  const t = THREAD[size];
  const { recess, depth } = setScrewRecess(spec)!;

  cutRecess(add, m, { head: thread(t.d, t.pitch, L, 0), cutter: recessCutter(recess, L, depth, t.d), edges: false });
}

function hexNut({ spec, size, m, add }: BuildContext) {
  const isLock = spec.type === 'lock_nut';
  const s = isLock ? LOCK_NUT[size]!.s : HEX_NUT[size]!.s;
  const total = isLock ? LOCK_NUT[size]!.h : HEX_NUT[size]!.m;
  const metal = isLock ? total * 0.72 : total;
  const body = polygonShape(hexRadius(s), 6);

  body.holes.push(holePath(THREAD[size].d / 2));
  add(prism(body, metal, 0, Math.min(0.25, metal * 0.08)));

  if (!isLock) return;

  const ring = circleShape((s * 0.9) / 2);

  ring.holes.push(holePath(THREAD[size].d / 2));
  add(prism(ring, total - metal, metal), m.nylon);
}

function squareNut({ size, add }: BuildContext) {
  const { s, m: h } = SQUARE_NUT[size]!;
  const sq = polygonShape((s / 2) * Math.SQRT2, 4, Math.PI / 4);

  sq.holes.push(holePath(THREAD[size].d / 2));
  add(prism(sq, h, 0));
}

function washer({ spec, size, add }: BuildContext) {
  const w = (spec.type === 'washer' ? WASHER : LARGE_WASHER)[size]!;
  const ring = circleShape(w.d2 / 2);

  ring.holes.push(holePath(w.d1 / 2));
  add(prism(ring, w.h, 0));
}

function heatInsertMesh({ spec, size, add }: BuildContext) {
  const { od, l } = heatInsert(spec);
  const ro = od / 2;
  const rk = ro - Math.max(0.2, od * 0.06);
  const ri = THREAD[size].d / 2;
  const prof: Array<[number, number]> = [
    [ri, 0],
    [rk, 0],
  ];
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
}

function standoff({ spec, size, L, m, add }: BuildContext) {
  const { s, male } = STANDOFF[size]!;
  const t = THREAD[size];
  const y0 = spec.type === 'standoff_mf' ? male : 0;

  if (spec.type === 'standoff_mf') add(thread(t.d, t.pitch, male, 0), m.main, false);

  const body = polygonShape(hexRadius(s), 6);

  body.holes.push(holePath(t.d / 2));
  add(prism(body, L, y0, 0.15));
}

function dowelPin({ spec, L, add }: BuildContext) {
  const r = Number(spec.size) / 2;
  const c = Math.min(0.4, r * 0.25);

  add(
    lathe([
      [0, 0],
      [r - c, 0],
      [r, c],
      [r, L - c],
      [r - c, L],
      [0, L],
    ]),
  );
}

function bearing({ spec, m, add }: BuildContext) {
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
}

const BUILDERS: Record<HardwareType, (ctx: BuildContext) => void> = {
  socket_head: socketHead,
  pan_head: panHead,
  button_head: buttonHead,
  countersunk,
  hex_bolt: hexBolt,
  set_screw: setScrew,
  hex_nut: hexNut,
  lock_nut: hexNut,
  square_nut: squareNut,
  washer,
  large_washer: washer,
  heat_insert: heatInsertMesh,
  standoff_mf: standoff,
  standoff_ff: standoff,
  dowel_pin: dowelPin,
  bearing,
  ...MOTION_BUILDERS,
  ...BEARING_BUILDERS,
  ...FRAME_BUILDERS,
  ...DRIVE_BUILDERS,
};

export function buildHardwarePieces(spec: HardwareSpec, m: HardwareMaterials): HardwarePiece[] {
  const pieces: HardwarePiece[] = [];
  const add: AddPiece = (geometry, material = m.main, edges = true) => {
    pieces.push({ geometry, material, edges });
  };

  BUILDERS[spec.type]?.({ spec, size: spec.size as MetricSize, L: spec.length ?? 0, m, add });

  const height = hardwareDimensions(spec).height;

  for (const p of pieces) p.geometry.translate(0, -height / 2, 0);

  return pieces;
}
