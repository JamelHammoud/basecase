import * as THREE from 'three';
import { classifyRobot, isWheelJoint, type RobotMorphology } from '../sim/morphology';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isMovable, type Rig, type V3 } from '../utils/kinematics';
import type { Capability, RobotSlot, SlotBinding } from './schema';

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

function chainReach(chain: RobotJoint[], tip: V3): number {
  const stops = [...chain.map((j) => j.origin), tip];

  return stops
    .slice(1)
    .reduce((sum, p, i) => sum + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...stops[i])), 0);
}

function armFacts(
  joints: RobotJoint[],
  rig: Rig,
  byId: Map<string, ScenePart>,
  morphology: RobotMorphology,
): Pick<RobotFacts, 'endEffector' | 'armJoints' | 'reachMm' | 'anchor'> {
  const hasTaggedArm = joints.some((j) => j.limb === 'arm');
  const leaf = morphology === 'fixed' || hasTaggedArm ? armLeaf(joints, rig, byId) : null;
  const part = leaf ? ownedParts(rig, leaf.id, byId)[0] : null;

  if (!leaf || !part) return { endEffector: null, armJoints: [], reachMm: 0, anchor: [0, 0, 0] };

  const chain = chainOf(rig, leaf);
  const point = farthestCorner(part, leaf.origin);

  return {
    endEffector: { part: part.id, point },
    armJoints: chain.map((j) => j.id),
    reachMm: chainReach(chain, point),
    anchor: chain[0].origin,
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
    ...(wheels.length ? (['wheels'] as const) : []),
    ...(morphology === 'legged' || morphology === 'wheel-legged' ? (['legs'] as const) : []),
  ];

  return { morphology, capabilities, movableJoints: joints.filter(isMovable).length, wheels, ...arm };
}

const NEED_WORDS: Record<Capability, string> = {
  arm: 'an arm with an end effector',
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
    return `This Case needs ${slot.minJoints} joints. This robot has ${facts.movableJoints}.`;

  return null;
}

export function boundEffector(binding: SlotBinding, facts: RobotFacts, rig: Rig): EndEffector | null {
  const bound = binding.endEffector;
  const owner = bound && rig.ownerOf.get(bound.part);
  const isLeaf = owner && !rig.joints.some((j) => rig.parentOf.get(j.id) === owner);

  return bound && isLeaf ? bound : facts.endEffector;
}
