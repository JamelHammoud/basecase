import * as THREE from 'three';
import { forwardKinematics, solveIK, type Rig, type V3 } from '../utils/kinematics';
import type { EndEffector } from './robotFit';

export const DOT_COUNT = 3;

const FORWARD_REACH_SHARE = 0.85;
const FORWARD_ELEVATIONS_DEG = [60, 30, 0, 75, 45, 15];
const IK_ITERATIONS = 80;
const REACHED_SHARE = 0.25;
const MIN_HEIGHT_MM = 30;
const CANDIDATE_FRACTIONS = [
  [0.45, 0.4],
  [-0.45, 0.4],
  [0.7, -0.5],
  [-0.7, -0.5],
  [0.25, 0.8],
  [-0.25, 0.8],
  [0.8, 0.1],
  [-0.8, 0.1],
];

function tipAt(rig: Rig, effector: EndEffector, values: Record<string, number>): V3 {
  const posed = forwardKinematics(rig, { values });
  const owner = rig.ownerOf.get(effector.part);
  const m = owner ? posed.joint.get(owner) : posed.root;
  const p = new THREE.Vector3(...effector.point).applyMatrix4(m ?? posed.root);

  return [p.x, p.y, p.z];
}

function candidateValues(rig: Rig, joints: string[], [first, rest]: number[]): Record<string, number> {
  const values: Record<string, number> = {};

  joints.forEach((id, i) => {
    const range = rig.byId.get(id)?.range ?? [-90, 90];
    const fraction = i === 0 ? first : rest;

    values[id] = fraction * (fraction >= 0 ? Math.max(...range) : -Math.min(...range));
  });

  return values;
}

const apart = (a: V3, b: V3, mm: number) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) > mm;

function pickSpots(candidates: V3[], rest: V3, radius: number): V3[] {
  const spots: V3[] = [];

  for (const spot of candidates) {
    const clear = spot[1] > MIN_HEIGHT_MM && apart(spot, rest, radius * 3);

    if (clear && spots.every((s) => apart(s, spot, radius * 3)) && spots.length < DOT_COUNT) spots.push(spot);
  }

  return spots;
}

export interface ArmReach {
  joints: string[];
  anchor: V3;
  reachMm: number;
}

function forwardSpots(rig: Rig, effector: EndEffector, arm: ArmReach, radius: number): V3[] {
  const r = arm.reachMm * FORWARD_REACH_SHARE;
  const [x, y, z] = arm.anchor;
  const reaches = (target: V3) =>
    solveIK(rig, {}, [{ partId: effector.part, point: effector.point, target }], {
      joints: arm.joints,
      iterations: IK_ITERATIONS,
      tolerance: 0.5,
    }).maxError <
    radius * REACHED_SHARE;

  return FORWARD_ELEVATIONS_DEG.map((deg): V3 => {
    const a = THREE.MathUtils.degToRad(deg);

    return [x, y + r * Math.sin(a), z + r * Math.cos(a)];
  }).filter(reaches);
}

export function dotSpots(rig: Rig, effector: EndEffector, arm: ArmReach, radius: number): V3[] {
  const rest = tipAt(rig, effector, {});
  const ahead = pickSpots(forwardSpots(rig, effector, arm, radius), rest, radius);

  if (ahead.length === DOT_COUNT) return ahead;

  const posed = CANDIDATE_FRACTIONS.map((f) => tipAt(rig, effector, candidateValues(rig, arm.joints, f)));

  return pickSpots(posed, rest, radius);
}
