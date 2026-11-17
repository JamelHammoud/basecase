import { box, type FixtureRobot, type P3 } from '../sim/fixtures/parts';
import type { RobotJoint } from '../types/robotics';
import { fixtureRobot, modelOf } from './fixtureModels';

export const KIT_EDIT_ROBOTS = ['quad-servo', 'hexapod', 'biped-servo'] as const;

function scaleLegs(robot: FixtureRobot, scale: number): FixtureRobot {
  return {
    ...robot,
    parts: robot.parts.map((part) => ({
      ...part,
      position: [part.position[0], part.position[1] * scale, part.position[2]],
      dimensions: {
        ...part.dimensions,
        height: part.id === 'body' ? part.dimensions.height : part.dimensions.height * scale,
      },
    })),
    joints: robot.joints.map((joint) => ({
      ...joint,
      origin: [joint.origin[0], joint.origin[1] * scale, joint.origin[2]],
    })),
  };
}

function wideHips(robot: FixtureRobot): FixtureRobot {
  const widen = ([x, y, z]: P3): P3 => [x * 1.15, y, z];

  return {
    ...robot,
    parts: robot.parts.map((part) => ({ ...part, position: widen(part.position) })),
    joints: robot.joints.map((joint) => ({ ...joint, origin: widen(joint.origin) })),
  };
}

function payload(robot: FixtureRobot): FixtureRobot {
  const body = robot.parts.find((part) => part.id === 'body')!;
  const at: P3 = [0, body.position[1] + body.dimensions.height / 2 + 10, 0];

  return {
    ...robot,
    parts: [...robot.parts, box('payload', at, [20, 20, 20], 50)],
    joints: robot.joints.map((joint) => ({
      ...joint,
      parent: joint.parent.includes('body') ? [...joint.parent, 'payload'] : joint.parent,
    })),
  };
}

function firstLimb(robot: FixtureRobot): RobotJoint[] {
  const root = robot.joints[0];
  const limb = [root];

  for (const joint of robot.joints.slice(1))
    if (limb.some((parent) => parent.id === joint.parentJoint)) limb.push(joint);

  return limb;
}

function addLimb(robot: FixtureRobot): FixtureRobot {
  const limb = firstLimb(robot);
  const ids = new Set(limb.flatMap((joint) => joint.child));
  const rename = (id: string) => (ids.has(id) ? `extra_${id}` : id);
  const shift = ([x, y, z]: P3): P3 => [x, y, z + 45];
  const joints = limb.map((joint) => ({
    ...joint,
    id: `extra_${joint.id}`,
    name: `extra_${joint.name}`,
    parent: joint.parent.map(rename),
    child: joint.child.map(rename),
    parentJoint: joint.parentJoint ? `extra_${joint.parentJoint}` : undefined,
    origin: shift(joint.origin),
  }));

  return {
    ...robot,
    parts: [
      ...robot.parts,
      ...robot.parts
        .filter((part) => ids.has(part.id))
        .map((part) => ({ ...part, id: rename(part.id), position: shift(part.position) })),
    ],
    joints: [...robot.joints, ...joints],
  };
}

function removeLimb(robot: FixtureRobot): FixtureRobot {
  const limb = firstLimb(robot);
  const ids = new Set(limb.flatMap((joint) => joint.child));
  const joints = new Set(limb.map((joint) => joint.id));

  return {
    ...robot,
    parts: robot.parts.filter((part) => !ids.has(part.id)),
    joints: robot.joints.filter((joint) => !joints.has(joint.id)),
  };
}

const edits: Record<string, (robot: FixtureRobot) => FixtureRobot> = {
  'lengthen legs': (robot) => scaleLegs(robot, 1.1),
  'shorten legs': (robot) => scaleLegs(robot, 0.9),
  'widen hips': wideHips,
  'torso mass': (robot) => ({
    ...robot,
    parts: robot.parts.map((part) => (part.id === 'body' ? { ...part, massG: part.massG! * 1.1 } : part)),
  }),
  payload,
  'joint limits': (robot) => ({
    ...robot,
    joints: robot.joints.map((joint) => ({
      ...joint,
      range: joint.range?.map((value) => value * 0.9) as [number, number] | undefined,
    })),
  }),
  'add limb': addLimb,
  'remove limb': removeLimb,
  'joint reordering': (robot) => ({ ...robot, joints: [...robot.joints].reverse() }),
};

export function kitEditModels(id: string) {
  const robot = fixtureRobot(id);
  const base = modelOf(robot);
  const generated = Object.entries(edits).map(([name, edit]) => ({ name, model: modelOf(edit(robot)) }));
  const stance = {
    ...base,
    initial: {
      ...base.initial,
      values: Object.fromEntries(base.joints.map((joint) => [joint.id, stanceDegrees(joint.id)])),
    },
  };

  return [...generated, { name: 'default stance', model: stance }];
}

function stanceDegrees(id: string) {
  if (id.endsWith('_bend')) return -4;

  if (id.endsWith('_pitch') || id.endsWith('_swing') || id.endsWith('_tilt')) return 2;

  return 0;
}
