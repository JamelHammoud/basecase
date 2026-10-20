import * as THREE from 'three';
import { pulleyLength } from '../data/frameHardware';
import {
  CLAMP_COLLARS,
  Collar,
  DIN471_RINGS,
  DIN472_RINGS,
  GT2_IDLERS,
  GT2_PULLEYS,
  Gt2Pulley,
  MISUMI_GPA_GT2060_WIDTH,
  SET_COLLARS,
} from '../data/motionTables';
import { ring } from './bearingMesh';
import type { BuildContext } from './hardwareMesh';
import { circleShape, holePath, prism } from './hardwarePrimitives';

function sideMark(add: BuildContext['add'], m: BuildContext['m'], opts: { r: number; dia: number; y: number }) {
  const g = prism(circleShape(opts.dia / 2), 0.3, -0.3);

  g.rotateZ(-Math.PI / 2);
  g.translate(opts.r, opts.y, 0);
  add(g, m.dark, false);
}

function collar(table: Record<string, Collar>) {
  return ({ spec, m, add }: BuildContext) => {
    const c = table[spec.size];
    const screw = Number(c.screw.slice(1).split('x')[0]);

    add(ring(c.bore / 2, c.od / 2, c.width));
    sideMark(add, m, { r: c.od / 2, dia: screw, y: c.width / 2 });

    if (!c.screwR) return;

    const slit = new THREE.BoxGeometry(0.5, c.width, (c.od - c.bore) / 2);

    slit.translate(0, c.width / 2, -(c.od + c.bore) / 4);
    add(slit, m.dark, false);
  };
}

function cRing({ rIn, rOut, lug, gap }: { rIn: number; rOut: number; lug: number; gap: number }): THREE.Shape {
  const s = new THREE.Shape();
  const a0 = Math.PI / 2 + gap / 2;
  const a1 = Math.PI / 2 - gap / 2 + Math.PI * 2;
  const lugA = 0.35;

  s.absarc(0, 0, rOut, a0 + lugA, a1 - lugA, false);
  s.absarc(0, 0, lug, a1 - lugA, a1, false);
  s.absarc(0, 0, rIn, a1, a0, true);
  s.absarc(0, 0, lug, a0, a0 + lugA, false);

  return s;
}

function retainingRing(shaft: boolean) {
  return ({ spec, add }: BuildContext) => {
    const r = shaft ? DIN471_RINGS[spec.size] : DIN472_RINGS[spec.size];
    const shape = shaft
      ? cRing({ rIn: r.d3 / 2, rOut: r.d3 / 2 + r.bApprox, lug: r.d3 / 2 + r.aMax, gap: 0.5 })
      : cRing({ rIn: r.d3 / 2 - r.bApprox, rOut: r.d3 / 2, lug: r.d3 / 2 - r.aMax, gap: 0.5 });

    add(prism(shape, r.s, 0));
  };
}

function teethShape(p: Gt2Pulley, bore: number): THREE.Shape {
  const s = new THREE.Shape();
  const R = p.od / 2;
  const r = R - 0.75;
  const step = (Math.PI * 2) / p.teeth;

  for (let i = 0; i < p.teeth; i++) {
    const a = i * step;
    const pts: Array<[number, number]> = [
      [R, a],
      [R, a + step * 0.5],
      [r, a + step * 0.62],
      [r, a + step * 0.88],
    ];

    for (const [rad, ang] of pts) {
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;

      if (i === 0 && ang === a) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
  }

  s.closePath();
  s.holes.push(holePath(bore / 2, 32));

  return s;
}

const W = MISUMI_GPA_GT2060_WIDTH;

function pulley(table: Record<string, Gt2Pulley>) {
  return ({ spec, m, add }: BuildContext) => {
    const p = table[spec.size];
    const hub = p.hubD ? pulleyLength(p) - W.widthOverFlangesW : 0;
    const boss = (W.widthOverFlangesW - W.toothWidthA - 2 * W.flangeThickness) / 2;

    if (p.hubD) {
      add(ring(p.bore / 2, p.hubD / 2, hub));
      sideMark(add, m, { r: p.hubD / 2, dia: 4, y: hub / 2 });
    }

    const y = (k: number) => hub + k;

    add(ring(p.bore / 2, p.flange / 2, W.flangeThickness, y(0)));
    add(ring(p.bore / 2, p.boss / 2, boss, y(W.flangeThickness)));
    add(prism(teethShape(p, p.bore), W.toothWidthA, y(W.flangeThickness + boss)));
    add(ring(p.bore / 2, p.boss / 2, boss, y(W.flangeThickness + boss + W.toothWidthA)));
    add(ring(p.bore / 2, p.flange / 2, W.flangeThickness, y(W.widthOverFlangesW - W.flangeThickness)));
  };
}

export const DRIVE_BUILDERS = {
  set_collar: collar(SET_COLLARS),
  clamp_collar: collar(CLAMP_COLLARS),
  shaft_ring: retainingRing(true),
  bore_ring: retainingRing(false),
  gt2_pulley: pulley(GT2_PULLEYS),
  gt2_idler: pulley(GT2_IDLERS),
};
