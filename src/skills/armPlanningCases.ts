import { Euler, Quaternion, Vector3 } from 'three';
import { box, joint, fixtureMeasures, fixtureTriangles, type FixtureRobot, type P3 } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import type { WorldItem } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureRobot } from './fixtureModels';

export const ARM_TASKS = [
  'divider',
  'column',
  'shelf',
  'cabinet',
  'bins',
  'parked-arm',
  'base-fold',
  'long-tool',
  'asymmetric',
  'narrow-passage',
] as const;
export type ArmTask = (typeof ARM_TASKS)[number];

const obstacle = (id: string, at: P3, size: P3): WorldItem => ({
  ...box(id, at, size, 1000),
  behavior: 'static',
});

function scenery(task: ArmTask): WorldItem[] {
  const rail = obstacle('divider', [0, 210, 0], [80, 20, 30]);

  if (task === 'divider') return [obstacle('wall', [0, 80, 80], [80, 160, 20])];

  if (task === 'shelf')
    return [
      obstacle('shelf-roof', [0, 190, 100], [100, 16, 200]),
      obstacle('shelf-floor', [0, 70, 150], [100, 10, 100]),
    ];

  if (task === 'cabinet')
    return [
      obstacle('cabinet-roof', [0, 190, 110], [110, 16, 220]),
      obstacle('cabinet-floor', [0, 40, 140], [110, 10, 160]),
      obstacle('cabinet-left', [-50, 115, 110], [10, 150, 220]),
      obstacle('cabinet-right', [50, 115, 110], [10, 150, 220]),
      obstacle('cabinet-back', [0, 115, 220], [110, 150, 10]),
    ];

  if (task === 'bins')
    return [
      obstacle('bin-divider', [0, 195, 0], [80, 50, 20]),
      obstacle('bin-a-floor', [0, 70, 150], [100, 10, 100]),
      obstacle('bin-b-floor', [0, 70, -150], [100, 10, 100]),
      obstacle('bin-a-end', [0, 120, 225], [100, 100, 10]),
      obstacle('bin-b-end', [0, 120, -225], [100, 100, 10]),
    ];

  if (task === 'parked-arm' || task === 'base-fold') return [];

  if (task === 'long-tool') return [obstacle('tool-rack', [0, 250, 0], [80, 20, 30])];

  if (task === 'narrow-passage')
    return [
      rail,
      obstacle('passage-left', [-28, 170, 0], [10, 240, 440]),
      obstacle('passage-right', [28, 170, 0], [10, 240, 440]),
    ];

  return [rail];
}

function modifyRobot(robot: FixtureRobot, task: ArmTask) {
  robot.joints[1] = { ...robot.joints[1], range: [-150, 150] };

  if (task === 'bins' || task === 'long-tool')
    robot.joints[2] = { ...robot.joints[2], axis: [1, 0, 0], range: [-150, 150] };

  if (task === 'long-tool') robot.parts[3] = { ...box('link2', [0, 260, 0], [18, 140, 18], 60) };

  if (task === 'narrow-passage') robot.joints[2] = { ...robot.joints[2], range: [-10, 10] };

  if (task === 'asymmetric') {
    robot.parts[1] = box('link0', [0, 75, 0], [18, 50, 30], 40);
    robot.parts[2] = box('link1', [0, 145, 0], [20, 90, 18], 60);
    robot.parts[3] = box('link2', [0, 217.5, 0], [18, 55, 24], 40);
    robot.joints[1] = { ...robot.joints[1], origin: [0, 100, 0] };
  }

  if (task === 'base-fold') {
    robot.parts.push(box('base-tower', [0, 210, 0], [80, 20, 30], 1000));
    robot.joints[0] = { ...robot.joints[0], parent: [...robot.joints[0].parent, 'base-tower'] };
  }

  if (task === 'parked-arm') {
    robot.parts.push(
      box('park-base', [85, 210, 0], [20, 30, 40], 1000),
      box('park-link', [40, 210, 0], [80, 20, 30], 100),
    );
    robot.joints.push(
      joint({
        id: 'park-joint',
        link: ['park-base', 'park-link'],
        origin: [85, 210, 0],
        axis: [0, 1, 0],
        effortNm: 10,
      }),
    );
  }
}

function transform(robot: FixtureRobot, world: WorldItem[], rotation: P3, lift: number) {
  const turn = new Quaternion().setFromEuler(new Euler(...(rotation.map((v) => (v * Math.PI) / 180) as P3), 'XYZ'));
  const point = (v: P3, translate = true): P3 => {
    const p = new Vector3(...v).applyQuaternion(turn);

    return [p.x, p.y + (translate ? lift : 0), p.z];
  };
  const placed = <T extends FixtureRobot['parts'][number]>(part: T): T => ({
    ...part,
    position: point(part.position),
    rotation,
  });

  return {
    robot: {
      ...robot,
      parts: robot.parts.map(placed),
      joints: robot.joints.map((j) => ({ ...j, origin: point(j.origin), axis: point(j.axis, false) })),
    },
    world: world.map(placed),
  };
}

export function armPlanningCase(task: ArmTask, yaw = 0) {
  const source = fixtureRobot('arm-3dof');

  modifyRobot(source, task);

  const rotation: P3 = task === 'column' ? [0, yaw, 90] : [0, yaw, 0];
  const lifts: Partial<Record<ArmTask, number>> = { column: 350, 'long-tool': 150 };
  const lift = lifts[task] ?? 0;
  const { robot, world } = transform(source, scenery(task), rotation, lift);
  const rig = buildRig(robot.joints, robot.parts);
  const start = task === 'shelf' ? 60 : -60;
  const goal = task === 'shelf' ? -60 : 60;
  const initial = { arm0: start, arm1: 0, arm2: 0, 'park-joint': 0 };
  const target = { arm0: goal, arm1: 0, arm2: 0, 'park-joint': 0 };

  if (task === 'divider') {
    initial.arm0 = -40;
    target.arm0 = 15;
    target.arm1 = 15;
  }

  const project = {
    ...DEFAULT_PROJECT,
    joints: robot.joints,
    selfContact: task === 'base-fold' ? { [rig.robots[0].key]: { enabled: true } } : undefined,
  };
  const input = {
    parts: robot.parts,
    rig,
    project,
    world,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    pose: { values: initial },
    fixedBase: Object.fromEntries(rig.robots.map((r) => [r.key, true])),
  };

  return { task, input, target, model: buildMjcf(input) };
}
