import { REACH_PER_SECOND } from '../sim/drive';
import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, CaseGoal, GoalValues } from './caseGoals';
import { FLOOR_PROBE_DEPTH_MM } from './probes';
import type { CaseControl, CaseProbe, ReferenceCommand, WorldObject } from './schema';
import type { Formula } from '../skills/contract';
import { selectedPickObject, selectedPickSpan } from './selectedPick';
import { lowerCommands } from './referenceMotion';
import { selectedPickContract } from './selectedPickContract';

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
const MIN_SPACING_MM = 50;
const OPEN = [0, 0];
const SHUT = [0, 1];

interface Layout {
  selected?: WorldObject;
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
  if (robot.pickTarget) {
    const selected = selectedPickObject(robot.pickTarget);
    const size = selectedPickSpan(robot.pickTarget, [0, 1, 0]);
    const depth = robot.facts.gripper?.depthMm ?? 0;
    const [x, y, z] = selected.position;

    return {
      selected,
      size,
      block: selected.position,
      spot: [x, y, z + v.spacingMm],
      gripY: Math.max(y, depth + TIP_CLEARANCE_MM),
      hoverY: Math.max(y + size * 1.5 + depth, y + size / 2 + (robot.facts.gripper?.palmMm ?? 0) * 2 + depth),
    };
  }

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
  lower?: boolean;
}

function closingSteps(layout: Layout): Step[] {
  const target: V3 = [layout.block[0], layout.gripY, layout.block[2]];

  if (!layout.selected) return [{ target, aux: SHUT, wait: GRIP_S }];

  return [0.25, 0.5, 0.75, 1].map((share) => ({ target, aux: [0, share], wait: share === 1 ? GRIP_S : GRIP_S / 4 }));
}

function steps(layout: Layout, approach?: V3): Step[] {
  const { block, spot, gripY, hoverY } = layout;
  const at = (p: V3, y: number): V3 => [p[0], y, p[2]];

  return [
    ...(approach ? [{ target: at(approach, hoverY), aux: OPEN }] : []),
    { target: at(block, hoverY), aux: OPEN },
    { target: at(block, gripY), aux: OPEN },
    ...closingSteps(layout),
    { target: at(block, hoverY), aux: SHUT },
    { target: at(spot, hoverY), aux: SHUT },
    { target: at(spot, gripY), aux: SHUT, lower: !!layout.selected },
    { target: at(spot, gripY), aux: OPEN, wait: GRIP_S },
    { target: at(spot, hoverY), aux: OPEN },
  ];
}

const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function timeline(robot: BuilderRobot, layout: Layout): ReferenceCommand[] {
  const speed = Math.max(robot.facts.reachMm, 1) * REACH_PER_SECOND;
  const jaws = new Set(robot.facts.gripper?.jaws.map((jaw) => jaw.joint));
  const replacementFingers = robot.rig?.parts.some(
    (part) => part.gripperFinger?.role === 'finger' && jaws.has(part.gripperFinger.joint),
  );
  let from = robot.facts.endEffector?.point ?? layout.block;
  let at = START_S;

  return steps(layout, layout.selected ? robot.facts.endEffector?.point : undefined).flatMap((s) => {
    const command = { at: Math.round(at * 100) / 100, target: s.target, aux: s.aux };

    const movingSeconds = (distance(from, s.target) / speed) * MOVE_SLACK;
    const duration = s.lower ? distance(from, s.target) / (speed * 0.2) : movingSeconds;
    const lifting = replacementFingers && !!layout.selected && s.aux === SHUT && s.target[1] > from[1];
    const commands = s.lower || lifting ? lowerCommands(command, from, duration) : [command];

    at += s.wait ?? duration + SETTLE_S;
    from = s.target;

    return commands;
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

const spotId = (layout: Layout) => (layout.selected?.id === 'spot' ? 'pick-spot' : 'spot');

function objects(layout: Layout, radius: number): WorldObject[] {
  const { size, block, spot, selected } = layout;

  return [
    selected ?? {
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
      id: spotId(layout),
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
  bounds: { spacingMm: { min: MIN_SPACING_MM } },
  plan: (robot, v) => {
    const { facts } = robot;
    const layout = layoutOf(robot, v);
    const [x, , z] = layout.block;
    const block = layout.selected?.id ?? 'block';
    const probes: CaseProbe[] = [
      { signal: 'spot', from: { object: block }, to: { object: spotId(layout) } },
      { signal: 'lift', from: { object: block }, to: { point: [x, -FLOOR_PROBE_DEPTH_MM, z] } },
      ...(layout.selected
        ? (['grip', 'contact'] as const).map((kind) => ({
            signal: kind,
            kind,
            from: 'end-effector' as const,
            to: { object: block },
          }))
        : []),
    ];

    return {
      brief: layout.selected
        ? `Pick up ${layout.selected.name} and set it on the spot.`
        : 'Pick up the block and set it on the spot.',
      slot: {
        needs: ['arm', 'gripper'],
        minJoints: 2,
        binding: facts.endEffector ? { endEffector: facts.endEffector } : {},
        reachMm: facts.reachMm,
        anchor: facts.anchor,
      },
      objects: objects(layout, v.radiusMm),
      probes,
      success: layout.selected ? selectedPickContract(layout.size, v.radiusMm) : success(layout, v.radiusMm),
      timeline: timeline(robot, layout),
      controls,
      route: { from: [x, 0, facts.anchor[2]], to: [x, 0, layout.spot[2]], halfWidth: v.radiusMm },
    };
  },
});
