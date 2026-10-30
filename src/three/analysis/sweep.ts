import * as THREE from 'three';
import type { SweepRequest } from '../../utils/engineeringTypes';
import { collide, place, type Placed } from './collide';
import { splitRotor } from './rotorSplit';

export type SweepSpec = SweepRequest;

export interface SweepHit {
  a: string;
  b: string;
  depthMm: number;
  angle: number;
}

const SWEEP_OPTIONS = { toleranceMm: 0.3, maxSamples: 300 };
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const ROTOR = '#output';
const ownerOf = (id: string) => (id.endsWith(ROTOR) ? id.slice(0, -ROTOR.length) : id);

function withRotors(placed: Placed[], spec: SweepSpec) {
  const actuators = new Set(spec.actuators ?? []);
  const moving = new Set(spec.moving);
  const out: Placed[] = [];

  for (const p of placed) {
    const split = actuators.has(p.id) ? splitRotor(p.solid) : null;

    if (!split) {
      out.push(p);

      continue;
    }

    out.push(place(p.id, split.stator, p.matrix), place(p.id + ROTOR, split.rotor, p.matrix));

    if (!moving.has(p.id)) moving.add(p.id + ROTOR);
  }

  return { placed: out, moving };
}

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

export function sweepClashes(scene: Placed[], spec: SweepSpec): SweepHit[] {
  const { placed, moving: movingSet } = withRotors(scene, spec);
  const moving = [...movingSet];
  const options = { ...SWEEP_OPTIONS, focus: moving, straddle: moving, coplanar: false };
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

    if (floor) out.push({ ...floor, a: ownerOf(floor.a) });

    for (const f of collide(posed, options).interferences) {
      if (baseline.has(pairKey(f.a, f.b)) || ownerOf(f.a) === ownerOf(f.b)) continue;

      const [a, b] = movingSet.has(f.a) ? [f.a, f.b] : [f.b, f.a];

      out.push({ a: ownerOf(a), b: ownerOf(b), depthMm: f.depthMm, angle });
    }
  }

  return out;
}
