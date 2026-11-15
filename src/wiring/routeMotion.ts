import * as THREE from 'three';
import type { RobotJoint } from '../types/robotics';
import { sweepSamples } from '../utils/engineeringJoints';
import { buildRig, forwardKinematics, partMotion, type Rig } from '../utils/kinematics';
import { resolveJoints } from '../utils/kinematics';
import type { WiringScene } from './connectors';

export const MAX_ROUTE_POSES = 4096;

export interface RouteMotion {
  rig: Rig;
  joints: RobotJoint[];
  samples: number[][];
  halves: Map<string, number>;
  failure: string | null;
}

function samplesOf(joint: RobotJoint): number[] {
  const range = joint.range;

  if (
    !range ||
    range.length !== 2 ||
    !range.every((value) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) ||
    Math.abs(range[1] - range[0]) / 15 > MAX_ROUTE_POSES
  )
    return [];

  const rest = Math.min(Math.max(0, Math.min(...range)), Math.max(...range));

  return [...new Set([...sweepSamples(joint, range), ...range, rest])].sort((a, b) => a - b);
}

export function routeMotion(scene: WiringScene): RouteMotion {
  const rig = buildRig(resolveJoints(scene.project.joints ?? [], scene.parts), scene.parts);
  const joints = rig.joints.filter((j) => j.type !== 'fixed');
  const samples = joints.map(samplesOf);
  const halves = new Map(
    joints.map((j, i) => [j.id, Math.max(0, ...samples[i].slice(1).map((v, k) => (v - samples[i][k]) / 2))]),
  );
  const invalid = joints.some((j) => !j.range || j.range.length !== 2 || !j.range.every(Number.isFinite));
  const failure = invalid ? 'Joint range unbounded' : unsupported(rig.joints, samples);

  return { rig, joints, samples, halves, failure };
}

function unsupported(joints: RobotJoint[], samples: number[][]): string | null {
  if (joints.some((j) => j.loop)) return 'Coupled linkage geometry unresolved';

  if (joints.some((j) => j.type !== 'fixed' && (!j.axis.every(Number.isFinite) || Math.hypot(...j.axis) < 1e-9)))
    return 'Joint axis missing';

  return samples.some((values) => !values.length) ||
    samples.reduce((count, values) => count * values.length, 1) > MAX_ROUTE_POSES
    ? 'Range coverage exceeds routing limit'
    : null;
}

export function* routePoses(motion: RouteMotion): Generator<Record<string, number>> {
  const indices = motion.joints.map(() => 0);
  let done = false;

  while (!done) {
    yield Object.fromEntries(motion.joints.map((j, i) => [j.id, motion.samples[i][indices[i]]]));

    let at = indices.length - 1;

    while (at >= 0 && ++indices[at] === motion.samples[at].length) {
      indices[at] = 0;
      at--;
    }

    done = at < 0;
  }
}

export function poseTransforms(motion: RouteMotion, values: Record<string, number>): Map<string, THREE.Matrix4> {
  if (!Object.keys(values).length) return new Map(motion.rig.parts.map((p) => [p.id, new THREE.Matrix4()]));

  const posed = forwardKinematics(motion.rig, { values });

  return new Map(motion.rig.parts.map((p) => [p.id, partMotion(motion.rig, posed, p.id) ?? new THREE.Matrix4()]));
}
