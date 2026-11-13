import * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, partMatrix, type V3 } from '../utils/kinematics';
import type { EndEffector, RobotFacts } from './robotFit';
import { slotRefusal } from './robotFit';
import type { RobotSlot } from './schema';
import { plural } from '../../electron/plural.mjs';

export interface SlotRobot {
  parts: ScenePart[];
  joints: RobotJoint[];
}

export interface Placement {
  id: (id: string) => string;
  at: (p: V3) => V3;
  turn: (v: V3) => V3;
  rotate: (euler: V3) => V3;
}

const UP = new THREE.Vector3(0, 1, 0);

export const slotPrefix = (slot: string) => `${slot}.`;

export const robotPivot = (robot: SlotRobot): V3 => buildRig(robot.joints, robot.parts).robots[0]?.pivot ?? [0, 0, 0];

export function placementOf(slot: Pick<RobotSlot, 'id' | 'pose'>, pivot: V3): Placement {
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(slot.pose?.yawDeg ?? 0));
  const to = new THREE.Vector3(...(slot.pose?.position ?? pivot));
  const from = new THREE.Vector3(...pivot);
  const vec = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

  return {
    id: (id) => `${slotPrefix(slot.id ?? '')}${id}`,
    at: (p) => vec(new THREE.Vector3(...p).sub(from).applyQuaternion(turn).add(to)),
    turn: (v) => vec(new THREE.Vector3(...v).applyQuaternion(turn)),
    rotate: (euler) => {
      const own = new THREE.Quaternion().setFromRotationMatrix(
        partMatrix({ position: [0, 0, 0], rotation: euler } as ScenePart),
      );
      const e = new THREE.Euler().setFromQuaternion(turn.clone().multiply(own), 'XYZ');

      return [e.x, e.y, e.z].map((r) => THREE.MathUtils.radToDeg(r)) as V3;
    },
  };
}

function placedPart(p: ScenePart, place: Placement): ScenePart {
  return {
    ...p,
    mirrorOf: undefined,
    mates: undefined,
    frame: undefined,
    id: place.id(p.id),
    position: place.at(p.position),
    rotation: place.rotate(p.rotation),
    ...(p.group ? { group: { ...p.group, id: place.id(p.group.id) } } : {}),
    ...(p.jointId ? { jointId: place.id(p.jointId) } : {}),
  };
}

function placedJoint(j: RobotJoint, place: Placement): RobotJoint {
  return {
    ...j,
    id: place.id(j.id),
    parent: j.parent.map(place.id),
    child: j.child.map(place.id),
    origin: place.at(j.origin),
    axis: place.turn(j.axis),
    ...(j.parentJoint ? { parentJoint: place.id(j.parentJoint) } : {}),
    ...(j.actuators ? { actuators: j.actuators.map(place.id) } : {}),
    ...(j.frame
      ? { frame: { part: place.id(j.frame.part), origin: place.at(j.frame.origin), axis: place.turn(j.frame.axis) } }
      : {}),
  };
}

export function placedRobot(robot: SlotRobot, place: Placement): SlotRobot {
  return {
    parts: robot.parts.map((p) => placedPart(p, place)),
    joints: robot.joints.map((j) => placedJoint(j, place)),
  };
}

export const placedEffector = (effector: EndEffector | null, place: Placement): EndEffector | null =>
  effector && { part: place.id(effector.part), point: place.at(effector.point) };

export function slotKeys(robots: Array<{ key: string }>, slots: Array<{ id: string }>): Array<string | null> {
  const guests = slots.slice(1).map((s) => slotPrefix(s.id));
  const lead = robots.find((r) => !guests.some((g) => r.key.startsWith(g)));

  return slots.map((s, i) => (i ? robots.find((r) => r.key.startsWith(slotPrefix(s.id)))?.key : lead?.key) ?? null);
}

export function slotRefusals(slots: RobotSlot[], facts: Array<RobotFacts | null>): Array<string | null> {
  return slots.map((slot, i) => {
    const own = facts[i];

    if (!own) return `This Case needs ${plural(slots.length, 'robot')}. Open the others in tabs.`;

    return slotRefusal(slot, own);
  });
}
