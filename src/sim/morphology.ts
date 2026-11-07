import { COMPONENT_BY_ID } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isMovable, type Rig, type RobotGroup } from '../utils/kinematics';

export type RobotMorphology = 'fixed' | 'legged' | 'wheeled' | 'wheel-legged';

const LEG_NAME = /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe|coxa|femur|tibia|tarsus/i;
const WHEEL_NAME = /wheel|caster|roller/i;
const MIN_CHAIN_JOINTS = 2;
const MIN_LEGS = 2;
const FOOT_BAND = 0.2;

function childParts(j: RobotJoint, byId: Map<string, ScenePart>): ScenePart[] {
  return j.child.flatMap((id) => byId.get(id) ?? []);
}

function isWheelPart(p: ScenePart): boolean {
  if (WHEEL_NAME.test(p.name)) return true;

  if (!p.componentId) return false;

  return COMPONENT_BY_ID[p.componentId]?.group === 'Wheels';
}

export function isWheelJoint(j: RobotJoint, byId: Map<string, ScenePart>, rig: Rig): boolean {
  if (j.type !== 'revolute' || j.range) return false;

  if (WHEEL_NAME.test(j.name) || WHEEL_NAME.test(j.id)) return true;

  const parts = [...rig.ownerOf].filter(([, owner]) => owner === j.id).map(([pid]) => byId.get(pid));

  return [...childParts(j, byId), ...parts.flatMap((p) => p ?? [])].some(isWheelPart);
}

const isNamedLeg = (j: RobotJoint) =>
  isMovable(j) && (j.limb === 'leg' || LEG_NAME.test(j.name) || LEG_NAME.test(j.id));

function leafJoints(joints: RobotJoint[], rig: Rig): RobotJoint[] {
  const parents = new Set(joints.map((j) => rig.parentOf.get(j.id)).filter(Boolean));

  return joints.filter((j) => !parents.has(j.id));
}

function chainLength(j: RobotJoint, rig: Rig): number {
  let n = 0;

  for (let id: string | null | undefined = j.id; id; id = rig.parentOf.get(id)) {
    const joint = rig.byId.get(id);

    if (joint && isMovable(joint)) n++;
  }

  return n;
}

function tipHeight(j: RobotJoint, byId: Map<string, ScenePart>, rig: Rig): number {
  const owned = [...rig.ownerOf].filter(([, owner]) => owner === j.id).map(([pid]) => byId.get(pid));
  const lows = owned.flatMap((p) => (p ? [p.position[1] - p.dimensions.height / 2] : []));

  return lows.length ? Math.min(...lows) : j.origin[1];
}

function hasHangingLegs(joints: RobotJoint[], byId: Map<string, ScenePart>, rig: Rig, robot: RobotGroup): boolean {
  const tips = leafJoints(joints, rig).filter(
    (j) => j.limb !== 'arm' && chainLength(j, rig) >= MIN_CHAIN_JOINTS && j.origin[1] < robot.pivot[1],
  );

  if (tips.length < MIN_LEGS) return false;

  const heights = tips.map((j) => tipHeight(j, byId, rig));
  const lowest = Math.min(...heights);
  const band = Math.max(1, (robot.pivot[1] - lowest) * FOOT_BAND);

  return heights.filter((h) => h - lowest <= band).length >= MIN_LEGS;
}

export function classifyRobot(robot: RobotGroup, rig: Rig, byId: Map<string, ScenePart>): RobotMorphology {
  const joints = rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key);
  const wheels = joints.filter((j) => isWheelJoint(j, byId, rig));
  const rest = joints.filter((j) => !wheels.includes(j));
  const legged = rest.some(isNamedLeg) || hasHangingLegs(rest, byId, rig, robot);

  if (wheels.length && legged) return 'wheel-legged';

  if (wheels.length) return 'wheeled';

  return legged ? 'legged' : 'fixed';
}
