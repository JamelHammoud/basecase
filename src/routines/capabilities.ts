import { COMPONENT_BY_ID } from '../data/components';
import { classifyRobot, isWheelJoint } from '../sim/morphology';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, isMovable } from '../utils/kinematics';
import type { Capability } from './schema';

export interface CapabilityScene {
  parts: ScenePart[];
  joints: RobotJoint[];
}

const GROUP_SENSES: Record<string, Capability[]> = {
  Cameras: ['camera'],
  'Depth Cameras': ['depth', 'camera'],
};

const SPEAKER = /speaker|amp\b|amplifier/i;
const MICROPHONE = /\bmic(rophone)?s?\b|mic array/i;
const NECK = /neck|head/i;

function audioSenses(name: string, id: string): Capability[] {
  const text = `${name} ${id.replace(/-/g, ' ')}`;

  return [
    ...(SPEAKER.test(text) ? ['speaker' as const] : []),
    ...(MICROPHONE.test(text) ? ['microphone' as const] : []),
  ];
}

function partSenses(part: ScenePart): Capability[] {
  const component = part.componentId ? COMPONENT_BY_ID[part.componentId] : undefined;

  if (!component) return [];

  if (component.group === 'Displays & Audio') return audioSenses(component.name, component.id);

  return GROUP_SENSES[component.group] ?? [];
}

export const isNeck = (j: RobotJoint) => isMovable(j) && (j.limb === 'neck' || NECK.test(j.id) || NECK.test(j.name));

function movers(scene: CapabilityScene): Capability[] {
  const rig = buildRig(scene.joints, scene.parts);
  const byId = new Map(scene.parts.map((p) => [p.id, p]));
  const found = new Set<Capability>();

  for (const robot of rig.robots) {
    const morphology = classifyRobot(robot, rig, byId);

    if (morphology === 'legged' || morphology === 'wheel-legged') found.add('legs');

    if (morphology === 'wheeled' || morphology === 'wheel-legged') found.add('wheels');
  }

  if (scene.joints.some((j) => isMovable(j) && j.limb === 'arm')) found.add('arms');

  if (rig.robots.length && !found.size && rig.joints.some((j) => isMovable(j) && !isNeck(j))) found.add('arms');

  if (scene.joints.some((j) => isWheelJoint(j, byId, rig))) found.add('wheels');

  if (scene.joints.some(isNeck)) found.add('head');

  return [...found];
}

export function sceneCapabilities(scene: CapabilityScene): Capability[] {
  const senses = scene.parts.filter((p) => p.visible !== false).flatMap(partSenses);

  return [...new Set<Capability>([...senses, ...movers(scene)])];
}
