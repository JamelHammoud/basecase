import * as THREE from 'three';
import type { JointValues, RobotJoint, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import type { ArmGrip } from './driveGrip';
import { rigForWorker, type ArmSetup, type RoverSetup, type WheelSetup } from './drive';
import { isWheelJoint } from './morphology';

const UP = new THREE.Vector3(0, 1, 0);
const SCENE_FORWARD = new THREE.Vector3(0, 0, 1);
const MIN_ROLL = 0.5;
const WHEEL_SPEED_RAD_S = 8;
const TURN_SPEED_RAD_S = 2;

export function roverForward(wheelAxes: V3[]): THREE.Vector3 {
  const axis = wheelAxes[0];

  if (!axis) return SCENE_FORWARD.clone();

  const rolling = new THREE.Vector3(...axis).normalize().cross(UP);

  return Math.abs(rolling.dot(SCENE_FORWARD)) >= MIN_ROLL ? SCENE_FORWARD.clone() : rolling.normalize();
}

function wheelRadius(j: RobotJoint, rig: Rig, byId: Map<string, ScenePart>): number {
  const parts = [...rig.ownerOf].flatMap(([id, owner]) => (owner === j.id ? (byId.get(id) ?? []) : []));
  const sizes = parts.map((p) => Math.max(p.dimensions.height, p.dimensions.depth, p.dimensions.width) / 2);

  return Math.max(...sizes, 1);
}

export function wheelSetups(rig: Rig, parts: ScenePart[], robot?: string): WheelSetup[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const wheels = rig.joints.filter((j) => (!robot || rig.robotOf.get(j.id) === robot) && isWheelJoint(j, byId, rig));
  const forward = roverForward(wheels.map((j) => j.axis));
  const left = UP.clone().cross(forward);
  const center = wheels
    .reduce((sum, j) => sum.add(new THREE.Vector3(...j.origin)), new THREE.Vector3())
    .divideScalar(Math.max(wheels.length, 1));

  return wheels.map((j) => {
    const rolling = new THREE.Vector3(...j.axis).normalize().cross(UP).dot(forward);

    return {
      joint: j.id,
      spin: rolling >= 0 ? 1 : -1,
      lateralMm: new THREE.Vector3(...j.origin).sub(center).dot(left),
      radiusMm: wheelRadius(j, rig, byId),
    };
  });
}

export function roverSetup(rig: Rig, parts: ScenePart[], robot: string): RoverSetup {
  const wheels = wheelSetups(rig, parts, robot);
  const radius = Math.min(...wheels.map((w) => w.radiusMm));

  return {
    kind: 'rover',
    robot,
    wheels,
    maxSpeedMmS: radius * WHEEL_SPEED_RAD_S,
    maxTurnRadS: TURN_SPEED_RAD_S,
  };
}

export interface ArmSetupInput {
  rig: Rig;
  robot: string;
  effector: { part: string; point: V3 };
  joints: string[];
  anchor: V3;
  reachMm: number;
  start?: JointValues;
  grip?: ArmGrip | null;
}

export function armSetup(input: ArmSetupInput): ArmSetup {
  return {
    kind: 'arm',
    robot: input.robot,
    rig: rigForWorker(input.rig),
    part: input.effector.part,
    point: input.effector.point,
    joints: input.joints,
    start: input.start ?? {},
    anchor: input.anchor,
    reachMm: input.reachMm,
    ...(input.grip ? { grip: input.grip } : {}),
  };
}
