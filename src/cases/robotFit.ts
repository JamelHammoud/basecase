import * as THREE from 'three';
import { classifyRobot, isWheelJoint, type RobotMorphology } from '../sim/morphology';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isMovable, type Rig, type V3 } from '../utils/kinematics';
import { findGripper, type Gripper } from './gripper';
import type { Capability, RobotSlot, SlotBinding } from './schema';
import { plural } from '../../electron/plural.mjs';

export interface EndEffector {
  part: string;
  point: V3;
}

export interface RobotFacts {
  morphology: RobotMorphology;
  capabilities: Capability[];
  movableJoints: number;
  endEffector: EndEffector | null;
  armJoints: string[];
  reachMm: number;
  anchor: V3;
  wheels: string[];
  gripper: Gripper | null;
}

const MIN_ARM_JOINTS = 2;

function ownedParts(rig: Rig, jointId: string, byId: Map<string, ScenePart>): ScenePart[] {
  return [...rig.ownerOf].flatMap(([id, owner]) => (owner === jointId ? (byId.get(id) ?? []) : []));
}

function chainOf(rig: Rig, leaf: RobotJoint): RobotJoint[] {
  const chain: RobotJoint[] = [];

  for (let id: string | null | undefined = leaf.id; id; id = rig.parentOf.get(id)) {
    const joint = rig.byId.get(id);

    if (joint && isMovable(joint)) chain.unshift(joint);
  }

  return chain;
}

function leafJoints(joints: RobotJoint[], rig: Rig): RobotJoint[] {
  const parents = new Set(joints.map((j) => rig.parentOf.get(j.id)).filter(Boolean));

  return joints.filter((j) => !parents.has(j.id));
}

const CORNERS = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => [x, y, z])));

function farthestCorner(part: ScenePart, from: V3): V3 {
  const place = new THREE.Vector3(...part.position);
  const origin = new THREE.Vector3(...from);
  const { width, height, depth } = part.dimensions;
  const tip = new THREE.Vector3(...part.position);
  const direction = place.clone().sub(origin);

  if (direction.lengthSq() < 1e-6) return part.position;

  const axis = direction.normalize();
  const extent = CORNERS.reduce((most, [x, y, z]) => {
    const along = x * width * axis.x + y * height * axis.y + z * depth * axis.z;

    return Math.max(most, along);
  }, 0);

  tip.addScaledVector(axis, extent);

  return [tip.x, tip.y, tip.z];
}

function armLeaf(joints: RobotJoint[], rig: Rig, byId: Map<string, ScenePart>): RobotJoint | null {
  const candidates = leafJoints(joints, rig)
    .filter((j) => !isWheelJoint(j, byId, rig))
    .filter((j) => chainOf(rig, j).length >= MIN_ARM_JOINTS);
  const tagged = candidates.filter((j) => chainOf(rig, j).some((c) => c.limb === 'arm'));

  return tagged[0] ?? candidates[0] ?? null;
}

const ALONG_AXIS = 0.999;

function swingsTip(joint: RobotJoint, tip: V3): boolean {
  const toTip = new THREE.Vector3(...tip).sub(new THREE.Vector3(...joint.origin));

  if (toTip.lengthSq() < 1e-6) return false;

  return Math.abs(new THREE.Vector3(...joint.axis).normalize().dot(toTip.normalize())) < ALONG_AXIS;
}

function fromShoulder(chain: RobotJoint[], tip: V3): RobotJoint[] {
  const shoulder = chain.findIndex((j) => swingsTip(j, tip));

  return shoulder > 0 ? chain.slice(shoulder) : chain;
}

function chainReach(chain: RobotJoint[], tip: V3): number {
  const stops = [...chain.map((j) => j.origin), tip];

  return stops
    .slice(1)
    .reduce((sum, p, i) => sum + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...stops[i])), 0);
}

type ArmFacts = Pick<RobotFacts, 'endEffector' | 'armJoints' | 'reachMm' | 'anchor' | 'gripper'>;

const NO_ARM: ArmFacts = { endEffector: null, armJoints: [], reachMm: 0, anchor: [0, 0, 0], gripper: null };

function handOf(rig: Rig, leaf: RobotJoint, byId: Map<string, ScenePart>, gripper: Gripper | null): EndEffector | null {
  const part = ownedParts(rig, leaf.id, byId)[0];

  if (!part) return null;

  if (gripper?.palm === leaf.id) return { part: part.id, point: gripper.centre };

  return { part: part.id, point: farthestCorner(part, leaf.origin) };
}

function armFacts(joints: RobotJoint[], rig: Rig, byId: Map<string, ScenePart>, morphology: RobotMorphology): ArmFacts {
  const hasTaggedArm = joints.some((j) => j.limb === 'arm');

  if (morphology !== 'fixed' && !hasTaggedArm) return NO_ARM;

  const found = findGripper(rig, joints, byId);
  const jaws = new Set(found?.jaws.map((j) => j.joint));
  const leaf = armLeaf(
    joints.filter((j) => !jaws.has(j.id)),
    rig,
    byId,
  );
  const gripper = found && leaf?.id === found.palm ? found : null;
  const hand = leaf && handOf(rig, leaf, byId, gripper);

  if (!leaf || !hand) return NO_ARM;

  const chain = chainOf(rig, leaf);
  const swing = fromShoulder(chain, hand.point);

  return {
    endEffector: hand,
    armJoints: chain.map((j) => j.id),
    reachMm: chainReach(swing, hand.point),
    anchor: swing[0].origin,
    gripper,
  };
}

export function robotFacts(rig: Rig, parts: ScenePart[], robotKey?: string): RobotFacts {
  const robot = rig.robots.find((r) => r.key === robotKey) ?? rig.robots[0];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const joints = robot ? rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key) : [];
  const morphology = robot ? classifyRobot(robot, rig, byId) : 'fixed';
  const wheels = joints.filter((j) => isWheelJoint(j, byId, rig)).map((j) => j.id);
  const arm = armFacts(joints, rig, byId, morphology);
  const capabilities: Capability[] = [
    ...(arm.endEffector ? (['arm'] as const) : []),
    ...(arm.gripper ? (['gripper'] as const) : []),
    ...(wheels.length ? (['wheels'] as const) : []),
    ...(morphology === 'legged' || morphology === 'wheel-legged' ? (['legs'] as const) : []),
  ];

  return { morphology, capabilities, movableJoints: joints.filter(isMovable).length, wheels, ...arm };
}

const NEED_WORDS: Record<Capability, string> = {
  arm: 'an arm with an end effector',
  gripper: 'a gripper',
  wheels: 'driven wheels',
  legs: 'legs',
};

const HAS_WORDS: Record<RobotMorphology, string> = {
  fixed: 'a fixed base',
  legged: 'legs',
  wheeled: 'wheels',
  'wheel-legged': 'wheels on legs',
};

export function slotRefusal(slot: RobotSlot, facts: RobotFacts): string | null {
  const missing = slot.needs.filter((n) => !facts.capabilities.includes(n));

  if (missing.length)
    return `This Case needs ${missing.map((n) => NEED_WORDS[n]).join(' and ')}. This robot has ${HAS_WORDS[facts.morphology]}.`;

  if (slot.minJoints && facts.movableJoints < slot.minJoints)
    return `This Case needs ${plural(slot.minJoints, 'joint')}. This robot has ${facts.movableJoints}.`;

  return null;
}

const ON_PART_MM = 1;

function onPart(point: V3, part: ScenePart | undefined): boolean {
  if (!part) return false;

  const { width, height, depth } = part.dimensions;
  const away = new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...part.position));

  return away <= Math.hypot(width, height, depth) / 2 + ON_PART_MM;
}

export function boundEffector(binding: SlotBinding, facts: RobotFacts, rig: Rig): EndEffector | null {
  const bound = binding.endEffector;
  const owner = bound && rig.ownerOf.get(bound.part);
  const jaws = new Set(facts.gripper?.jaws.map((j) => j.joint));
  const isLeaf = owner && !rig.joints.some((j) => rig.parentOf.get(j.id) === owner && !jaws.has(j.id));
  const fits =
    bound &&
    isLeaf &&
    onPart(
      bound.point,
      rig.parts.find((p) => p.id === bound.part),
    );

  return fits ? bound : facts.endEffector;
}
