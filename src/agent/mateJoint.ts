import type { ScenePart, RobotJoint } from '../types/robotics';
import type { JointSpec } from '../workspace/agentBuildRequests';
import { r3, toCad, type V3 } from './agentFrame';
import type { MateArgs } from './mate';
import { findPort, type WorldPort } from './ports';

export interface MateJointOption {
  id: string;
  name?: string;
  range?: [number, number];
  limb?: RobotJoint['limb'];
  parent?: string[];
  child?: string[];
  parent_joint?: string;
}

const JOINT_TYPES: Partial<Record<MateArgs['type'], RobotJoint['type']>> = {
  coaxial: 'revolute',
  slider: 'prismatic',
};

function isOutput(parts: ScenePart[], id: string | undefined, port: string | undefined) {
  const part = id ? parts.find((p) => p.id === id) : undefined;

  return !!part && part.kind === 'component' && !!port && findPort(part, port)?.kind === 'output';
}

interface Sides {
  servo?: string;
  base: string;
  link: string;
}

function sides(parts: ScenePart[], args: MateArgs): Sides {
  const target = args.target ?? '';

  if (isOutput(parts, args.part, args.port)) return { servo: args.part, base: args.part, link: target };

  if (isOutput(parts, target, args.targetPort)) return { servo: target, base: target, link: args.part };

  return { base: target, link: args.part };
}

export function mateJointSpec(
  parts: ScenePart[],
  args: MateArgs & { joint: MateJointOption },
  at: WorldPort,
): JointSpec | string {
  const type = JOINT_TYPES[args.type];

  if (!type) return `A joint needs a coaxial or slider mate, not ${args.type.replace('_', ' ')}.`;

  if (args.frame) return 'A mate to a joint frame can’t declare a joint; mate to the parts on both sides.';

  const { servo, base, link } = sides(parts, args);
  const parent = args.joint.parent ?? [base];
  const child = args.joint.child ?? [link];

  return {
    id: args.joint.id,
    name: args.joint.name,
    type,
    parent,
    child,
    parent_joint: args.joint.parent_joint,
    actuators: servo ? [servo] : undefined,
    origin: toCad(at.position).map(r3) as V3,
    axis: toCad(at.axis).map(r3) as V3,
    range: args.joint.range,
    limb: args.joint.limb,
  };
}
