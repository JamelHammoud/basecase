import { buildCase, builderRobot } from '../../cases/caseBuilder';
import type { GoalKind } from '../../cases/caseGoals';
import { touchTheDots } from '../../cases/testing';
import type { Case, WorldObject } from '../../cases/schema';
import { buildRig } from '../../utils/kinematics';
import { box, joint, type FixtureRobot } from './parts';
import { fixtureRobots, roundWheelRover } from './robots';

export const CONTINUATION_SCENARIOS = [
  'block pickup',
  'cylinder transfer',
  'tray placement',
  'drawer pulling',
  'hinged-lid opening',
  'button pressing',
  'lever operation',
  'rover obstacle contact',
  'pan-tilt target following',
  'spring-return fixture contact',
] as const;

export type ContinuationScenario = (typeof CONTINUATION_SCENARIOS)[number];

const CHECKPOINT_SECONDS: Partial<Record<ContinuationScenario, number>> = {
  'pan-tilt target following': 1,
  'rover obstacle contact': 2,
  'spring-return fixture contact': 5,
};

function made(robot: FixtureRobot, goal: GoalKind, values = {}) {
  const result = buildCase(
    { goal, world: 'floor', values },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const object = (id: string, position: WorldObject['position'], size: WorldObject['size']): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position,
  size,
  rotation: [0, 0, 0],
  color: '#888888',
  behavior: 'static',
});

function tray(kase: Case): Case {
  const spot = kase.world.objects.find((value) => value.id === 'spot')!;
  const [x, , z] = spot.position;
  const half = Math.max(spot.size[0], 80) / 2;
  const walls = [
    object('tray-base', [x, 1, z], [half * 2, 2, half * 2]),
    object('tray-left', [x - half, 8, z], [2, 16, half * 2]),
    object('tray-right', [x + half, 8, z], [2, 16, half * 2]),
    object('tray-front', [x, 8, z - half], [half * 2, 16, 2]),
    object('tray-back', [x, 8, z + half], [half * 2, 16, 2]),
  ];

  return { ...kase, world: { ...kase.world, objects: [...kase.world.objects, ...walls] } };
}

function panTilt(): FixtureRobot {
  return {
    id: 'continuation-pan-tilt',
    parts: [
      box('base', [0, 20, 0], [40, 40, 40], 300),
      box('pan', [0, 55, 0], [20, 30, 20], 100),
      box('camera', [0, 80, 0], [40, 20, 25], 50),
    ],
    joints: [
      joint({ id: 'pan', link: ['base', 'pan'], origin: [0, 40, 0], axis: [0, 1, 0], effortNm: 1 }),
      joint({
        id: 'tilt',
        link: ['pan', 'camera'],
        origin: [0, 70, 0],
        axis: [1, 0, 0],
        effortNm: 1,
        parentJoint: 'pan',
      }),
    ],
    expect: { morphology: 'arm', stand: 'n/a', walk: 'n/a' },
  };
}

function scenarioCase(name: ContinuationScenario, robot: FixtureRobot): Case {
  if (name === 'pan-tilt target following') {
    const template = touchTheDots(fixtureRobots().find((value) => value.id === 'arm-3dof')!);

    return {
      ...template,
      task: { ...template.task, seconds: 3 },
      reference: {
        ...template.reference,
        timeline: [
          { at: 0, joints: { pan: 0, tilt: 0 } },
          { at: 0.6, joints: { pan: 25, tilt: -20 } },
          { at: 1.3, joints: { pan: -20, tilt: 15 } },
          { at: 2.1, joints: { pan: 15, tilt: -5 } },
        ],
      },
    };
  }

  if (name === 'rover obstacle contact') {
    const kase = made(robot, 'reach');

    return {
      ...kase,
      reference: { timeline: [{ at: 0, v: [1, 0, 0] }] },
      world: { ...kase.world, objects: [...kase.world.objects, object('obstacle', [0, 100, 220], [300, 200, 20])] },
    };
  }

  const goals: Partial<Record<ContinuationScenario, GoalKind>> = {
    'drawer pulling': 'drawer',
    'hinged-lid opening': 'lid',
    'button pressing': 'button',
    'lever operation': 'lever',
    'spring-return fixture contact': 'button',
  };
  const kase = made(
    robot,
    goals[name] ?? 'pick',
    name === 'spring-return fixture contact' ? { fixtureStiffness: 5000, fixtureSpringref: 0 } : {},
  );

  if (name === 'spring-return fixture contact')
    return {
      ...kase,
      reference: {
        timeline: [
          ...kase.reference.timeline,
          { at: 6.4, joints: Object.fromEntries(robot.joints.map((value) => [value.id, 0])) },
        ],
      },
    };

  if (name === 'tray placement') return tray(kase);

  if (name !== 'cylinder transfer') return kase;

  return {
    ...kase,
    world: {
      ...kase.world,
      objects: kase.world.objects.map((value) => (value.id === 'block' ? { ...value, kind: 'cylinder' } : value)),
    },
  };
}

export function continuationScenario(name: ContinuationScenario) {
  const arm = fixtureRobots().find((value) => value.id === 'arm-6dof')!;
  const robots: Partial<Record<ContinuationScenario, FixtureRobot>> = {
    'pan-tilt target following': panTilt(),
    'rover obstacle contact': roundWheelRover(),
  };
  const robot = robots[name] ?? arm;
  const kase = scenarioCase(name, robot);
  const marker: WorldObject = {
    ...object('continuation-marker', [0, 1000, 0], [5, 5, 5]),
    behavior: 'marker',
    movable: true,
  };

  return {
    robot,
    checkpoint: CHECKPOINT_SECONDS[name] ?? 3,
    kase: { ...kase, world: { ...kase.world, objects: [...kase.world.objects, marker] } },
  };
}
