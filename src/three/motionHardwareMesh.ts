import * as THREE from 'three';
import { MGN_CARRIAGES, MGN_RAILS } from '../data/motionTables';
import type { BuildContext } from './hardwareMesh';
import { circleShape, holePath, prism } from './hardwarePrimitives';

export function extrudeZ(shape: THREE.Shape, depth: number, z0 = -depth / 2): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });

  g.translate(0, 0, z0);

  return g;
}

export function rectShape(x0: number, y0: number, x1: number, y1: number): THREE.Shape {
  const s = new THREE.Shape();

  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);

  return s;
}

const circlePathAt = (x: number, y: number, r: number) => {
  const p = holePath(r, 24);

  return new THREE.Path(p.getPoints().map((v) => new THREE.Vector2(v.x + x, v.y + y)));
};

export function holeRun(length: number, first: number, pitch: number, keep: number): number[] {
  const out: number[] = [];

  for (let z = -length / 2 + first; z <= length / 2 - keep + 1e-6; z += pitch) out.push(z);

  return out;
}

function linearRail({ spec, add }: BuildContext) {
  const r = MGN_RAILS[spec.size];
  const L = spec.length ?? 0;
  const holes = holeRun(L, r.endE, r.pitchP, r.endEMin);
  const layer = (radius: number) => {
    const s = rectShape(-r.widthWR / 2, -L / 2, r.widthWR / 2, L / 2);

    for (const z of holes) s.holes.push(circlePathAt(0, -z, radius));

    return s;
  };
  const split = r.heightHR - r.counterboreDepth;

  add(prism(layer(r.boltHoleD / 2), split, 0));
  add(prism(layer(r.counterboreD / 2), r.counterboreDepth, split));
}

function railCarriage({ spec, m, add }: BuildContext) {
  const c = MGN_CARRIAGES[spec.size];
  const rail = MGN_RAILS[c.rail];
  const h = c.H - c.H1;
  const channelTop = rail.heightHR - c.H1;
  const half = rail.widthWR / 2 + 0.2;
  const profile = new THREE.Shape([
    new THREE.Vector2(-c.W / 2, 0),
    new THREE.Vector2(-half, 0),
    new THREE.Vector2(-half, channelTop),
    new THREE.Vector2(half, channelTop),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(c.W / 2, 0),
    new THREE.Vector2(c.W / 2, h),
    new THREE.Vector2(-c.W / 2, h),
  ]);
  const cap = (c.L - c.L1) / 2;

  add(extrudeZ(profile, c.L1));
  add(extrudeZ(profile, cap, c.L1 / 2), m.dark);
  add(extrudeZ(profile, cap, -c.L1 / 2 - cap), m.dark);

  const d = Number(c.thread.slice(1));

  for (const x of [-c.B / 2, c.B / 2])
    for (const z of [-c.C / 2, c.C / 2]) {
      const hole = prism(circleShape(d / 2), 0.3, h - 0.3);

      hole.translate(x, 0, z);
      add(hole, m.dark, false);
    }
}

export const MOTION_BUILDERS = {
  linear_rail: linearRail,
  rail_carriage: railCarriage,
};
