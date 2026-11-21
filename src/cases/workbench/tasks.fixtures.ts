import type { WorldObject, Case } from '../schema';
import { buildCase, builderRobot } from '../caseBuilder';
import type { GoalKind } from '../caseGoals';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig, type V3 } from '../../utils/kinematics';
import { caseRobot } from '../testing';
import { relocateCase } from './placement';

export const WORKBENCH_TASKS = [
  'block sorting',
  'tray packing',
  'drawer opening',
  'hinged-lid opening',
  'lever operation',
  'button pressing',
  'cylinder transfer',
  'shelf placement',
  'conveyor pickup',
  'fixed receptacle insertion',
] as const;

const GOALS: GoalKind[] = ['pick', 'pick', 'drawer', 'lid', 'lever', 'button', 'pick', 'pick', 'pick', 'pick'];

function wall(id: string, position: V3, size: V3): WorldObject {
  return {
    id,
    name: id,
    position,
    size,
    kind: 'box',
    behavior: 'static',
    rotation: [0, 0, 0],
    color: '#909090',
    friction: 0.8,
  };
}

function container(kase: Case, half: number) {
  const spot = kase.world.objects.find((object) => object.id === 'spot')!;
  const [x, , z] = spot.position;

  kase.world.objects.push(
    wall('receptacle-left', [x - half, 10, z], [6, 20, half * 2]),
    wall('receptacle-right', [x + half, 10, z], [6, 20, half * 2]),
    wall('receptacle-back', [x, 10, z + half], [half * 2, 20, 6]),
    wall('receptacle-front', [x, 10, z - half], [half * 2, 20, 6]),
  );
}

function shelf(kase: Case) {
  const spot = kase.world.objects.find((object) => object.id === 'spot')!;
  const rise = 35;

  spot.position[1] += rise;
  kase.world.objects.push(wall('shelf', [spot.position[0], rise / 2, spot.position[2]], [110, rise, 110]));

  for (const command of kase.reference.timeline) {
    if (command.target && Math.abs(command.target[2] - spot.position[2]) < 1) command.target[1] += rise;
  }
}

function changedArm(index: number) {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const scale = index % 2 ? 1.05 : 1;
  const times = (v: V3) => v.map((n) => n * scale) as V3;

  return {
    ...arm,
    parts: arm.parts.map((part) => ({
      ...part,
      position: times(part.position),
      dimensions: {
        ...part.dimensions,
        width: part.dimensions.width * scale,
        height: part.dimensions.height * scale,
        depth: part.dimensions.depth * scale,
      },
    })),
    joints: arm.joints.map((joint) => ({
      ...joint,
      origin: times(joint.origin),
      ...(joint.type === 'prismatic' ? { range: joint.range?.map((n) => n * scale) as [number, number] } : {}),
    })),
  };
}

export function workbenchTask(index: number) {
  const arm = changedArm(index);
  const builder = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);
  const built = buildCase({ goal: GOALS[index], world: 'floor' }, builder);

  if (!built.ok) throw new Error(built.problem);

  const source = structuredClone(built.kase);

  if (index === 1 || index === 9) container(source, index === 9 ? 45 : 65);

  if (index % 2 && source.slot?.binding.endEffector) source.slot.binding.endEffector.point[0] += 1;

  if (index === 6) source.world.objects.find((object) => object.id === 'block')!.kind = 'cylinder';

  if (index === 7) shelf(source);

  if (index === 8) {
    const block = source.world.objects.find((object) => object.id === 'block')!;

    source.world.objects.push(wall('stopped-conveyor', [block.position[0], -5, block.position[2]], [110, 10, 180]));
  }

  const yaw = (index - 4) * 7;
  const shift: V3 = [index * 23 - 100, 0, index * -11 + 40];
  const kase = relocateCase(source, { position: [0, 0, 0], yawDeg: -yaw }, shift);
  const radians = (yaw * Math.PI) / 180;
  const [x, y, z] = builder.pivot;
  const position: V3 = [
    shift[0] + x * Math.cos(radians) + z * Math.sin(radians),
    y,
    shift[2] - x * Math.sin(radians) + z * Math.cos(radians),
  ];

  return { source, kase, robot: caseRobot(arm), pose: { position, yawDeg: yaw } };
}
