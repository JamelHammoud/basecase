import { REACH_PER_SECOND } from '../sim/drive';
import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, CaseGoal, GoalValues } from './caseGoals';
import { FLOOR_PROBE_DEPTH_MM } from './probes';
import type { CaseControl, CaseProbe, ReferenceCommand, WorldObject } from './schema';
import type { Formula } from '../skills/contract';

export const BLOCK_SHARE_OF_OPENING = 0.7;
export const LIFT_SHARE = 0.5;

const BLOCK_TAN = '#c8a26a';
const SPOT_BLUE = '#0d99ff';
const BLOCK_DENSITY_G_PER_CM3 = 0.5;
const TIP_CLEARANCE_MM = 4;
const MOVE_SLACK = 1.4;
const SETTLE_S = 0.4;
const GRIP_S = 0.6;
const START_S = 0.2;
const END_HOLD_S = 0.3;
const SPARE_S = 1.5;
const OPEN = [0, 0];
const SHUT = [0, 1];

interface Layout {
  size: number;
  block: V3;
  spot: V3;
  gripY: number;
  hoverY: number;
}

export function blockSize({ facts }: BuilderRobot): number {
  return Math.max(10, Math.round((facts.gripper?.openingMm ?? 0) * BLOCK_SHARE_OF_OPENING));
}

type Placement = Pick<GoalValues, 'distanceMm' | 'spacingMm'>;

function layoutOf(robot: BuilderRobot, v: Placement): Layout {
  const size = blockSize(robot);
  const half = size / 2;
  const depth = robot.facts.gripper?.depthMm ?? 0;
  const [x, , z] = robot.facts.anchor;
  const gripY = Math.max(half, depth + TIP_CLEARANCE_MM);

  return {
    size,
    block: [x, half, z + v.distanceMm],
    spot: [x, half, z + v.distanceMm + v.spacingMm],
    gripY,
    hoverY: size * 2 + depth,
  };
}

interface Step {
  target: V3;
  aux: number[];
  wait?: number;
}

function steps({ block, spot, gripY, hoverY }: Layout): Step[] {
  const at = (p: V3, y: number): V3 => [p[0], y, p[2]];

  return [
    { target: at(block, hoverY), aux: OPEN },
    { target: at(block, gripY), aux: OPEN },
    { target: at(block, gripY), aux: SHUT, wait: GRIP_S },
    { target: at(block, hoverY), aux: SHUT },
    { target: at(spot, hoverY), aux: SHUT },
    { target: at(spot, gripY), aux: SHUT },
    { target: at(spot, gripY), aux: OPEN, wait: GRIP_S },
    { target: at(spot, hoverY), aux: OPEN },
  ];
}

const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function timeline(robot: BuilderRobot, layout: Layout): ReferenceCommand[] {
  const speed = Math.max(robot.facts.reachMm, 1) * REACH_PER_SECOND;
  let from = robot.facts.endEffector?.point ?? layout.block;
  let at = START_S;

  return steps(layout).map((s) => {
    const command = { at: Math.round(at * 100) / 100, target: s.target, aux: s.aux };

    at += s.wait ?? (distance(from, s.target) / speed) * MOVE_SLACK + SETTLE_S;
    from = s.target;

    return command;
  });
}

function pickSeconds(robot: BuilderRobot, v: Placement): number {
  const layout = layoutOf(robot, v);
  const last = timeline(robot, layout).at(-1)!;
  const rise = layout.hoverY / (Math.max(robot.facts.reachMm, 1) * REACH_PER_SECOND);

  return Math.ceil(last.at + rise * MOVE_SLACK + SETTLE_S + END_HOLD_S + SPARE_S);
}

function success(layout: Layout, radius: number): Formula {
  const lift = layout.size * LIFT_SHARE;

  return {
    sequence: [
      {
        eventually: {
          window: 'whole',
          state: { atom: { expr: { delta: { signal: 'lift' } }, cmp: '>', value: lift, scale: lift } },
        },
      },
      {
        always: {
          window: { last: END_HOLD_S },
          state: { atom: { expr: { signal: 'spot' }, cmp: '<', value: radius, scale: radius } },
        },
      },
    ],
  };
}

function objects({ size, block, spot }: Layout, radius: number): WorldObject[] {
  return [
    {
      id: 'block',
      name: 'Block',
      kind: 'box',
      position: block,
      rotation: [0, 0, 0],
      size: [size, size, size],
      color: BLOCK_TAN,
      behavior: 'dynamic',
      massG: Math.max(1, Math.round((size / 10) ** 3 * BLOCK_DENSITY_G_PER_CM3)),
    },
    {
      id: 'spot',
      name: 'Spot',
      kind: 'cylinder',
      position: spot,
      rotation: [0, 0, 0],
      size: [radius * 2, size, radius * 2],
      color: SPOT_BLUE,
      opacity: 0.35,
      behavior: 'marker',
    },
  ];
}

export function pickDefaults(robot: BuilderRobot): Partial<GoalValues> {
  const reach = robot.facts.reachMm;
  const values = {
    distanceMm: Math.round(reach * 0.4),
    spacingMm: Math.round(reach * 0.25),
    radiusMm: Math.max(12, Math.round(blockSize(robot) / 2)),
  };

  return { ...values, seconds: pickSeconds(robot, values) };
}

export const pickGoalWith = (controls: CaseControl[]): CaseGoal => ({
  kind: 'pick',
  name: 'Pick Up a Block',
  needs: ['gripper'],
  params: ['distanceMm', 'spacingMm', 'radiusMm', 'seconds'],
  plan: (robot, v) => {
    const { facts } = robot;
    const layout = layoutOf(robot, v);
    const [x, , z] = layout.block;
    const probes: CaseProbe[] = [
      { signal: 'spot', from: { object: 'block' }, to: { object: 'spot' } },
      { signal: 'lift', from: { object: 'block' }, to: { point: [x, -FLOOR_PROBE_DEPTH_MM, z] } },
    ];

    return {
      brief: 'Pick up the block and set it on the spot.',
      slot: {
        needs: ['arm', 'gripper'],
        minJoints: 2,
        binding: facts.endEffector ? { endEffector: facts.endEffector } : {},
        reachMm: facts.reachMm,
        anchor: facts.anchor,
      },
      objects: objects(layout, v.radiusMm),
      probes,
      success: success(layout, v.radiusMm),
      timeline: timeline(robot, layout),
      controls,
      route: { from: [x, 0, facts.anchor[2]], to: [x, 0, layout.spot[2]], halfWidth: v.radiusMm },
    };
  },
});
