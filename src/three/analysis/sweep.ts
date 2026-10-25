import * as THREE from 'three';
import { collide, place, type Placed } from './collide';

export interface SweepSpec {
  moving: string[];
  origin: [number, number, number];
  axis: [number, number, number];
  anglesDeg: number[];
}

export interface SweepHit {
  a: string;
  b: string;
  depthMm: number;
  angle: number;
}

const SWEEP_OPTIONS = { toleranceMm: 0.3, maxSamples: 300 };
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function lowestY(p: Placed) {
  const e = p.matrix.elements;
  const pos = p.solid.positions;
  let low = Infinity;

  for (let i = 0; i < pos.length; i += 3) low = Math.min(low, e[1] * pos[i] + e[5] * pos[i + 1] + e[9] * pos[i + 2]);

  return low + e[13];
}

function floorHit(moved: Placed[], angle: number): SweepHit | null {
  let low: { id: string; y: number } | null = null;

  for (const p of moved) {
    const y = lowestY(p);

    if (!low || y < low.y) low = { id: p.id, y };
  }

  return low && low.y < -1 ? { a: low.id, b: 'floor', depthMm: Math.round(-low.y * 10) / 10, angle } : null;
}

function rotationAbout(spec: SweepSpec, angle: number) {
  const origin = new THREE.Vector3(...spec.origin);
  const axis = new THREE.Vector3(...spec.axis).normalize();

  return new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(angle)))
    .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
}

export function sweepClashes(placed: Placed[], spec: SweepSpec): SweepHit[] {
  const movingSet = new Set(spec.moving);
  const options = { ...SWEEP_OPTIONS, focus: spec.moving, straddle: spec.moving, coplanar: false };
  const baseline = new Set(collide(placed, options).interferences.map((f) => pairKey(f.a, f.b)));
  const out: SweepHit[] = [];

  for (const angle of spec.anglesDeg) {
    const rotation = rotationAbout(spec, angle);
    const posed = placed.map((p) =>
      movingSet.has(p.id) ? place(p.id, p.solid, rotation.clone().multiply(p.matrix)) : p,
    );
    const floor = floorHit(
      posed.filter((p) => movingSet.has(p.id)),
      angle,
    );

    if (floor) out.push(floor);

    for (const f of collide(posed, options).interferences) {
      if (baseline.has(pairKey(f.a, f.b))) continue;

      const aMoves = movingSet.has(f.a);

      out.push({ a: aMoves ? f.a : f.b, b: aMoves ? f.b : f.a, depthMm: f.depthMm, angle });
    }
  }

  return out;
}
