import type { V3 } from '../utils/kinematics';
import type { Contract } from './contract';
import type { Formula as ContractFormula, State as ContractState } from '../skills/contract';
import type { RobotFacts } from './robotFit';
import type { WorldKind } from './caseWorlds';
import type { RoutePoint } from './groundRoute';
import type { CaseControl, CaseProbe, Capability, ReferenceCommand, RobotSlot, WorldObject } from './schema';

export type GoalKind = 'reach' | 'touch' | 'push' | 'path' | 'walk' | 'handoff';

export type ParamKey =
  'distanceMm' | 'heightMm' | 'sideMm' | 'radiusMm' | 'pushMm' | 'boxMm' | 'stops' | 'spacingMm' | 'seconds';

export type GoalValues = Record<ParamKey, number>;

export interface BuilderRobot {
  facts: RobotFacts;
  pivot: V3;
  footprint: { width: number; depth: number };
  armSpot: V3 | null;
  partner?: BuilderRobot;
}

export interface GoalParam {
  key: ParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface Route {
  from: V3;
  to: V3;
  halfWidth: number;
}

export interface GoalPlan {
  brief: string;
  slot: RobotSlot;
  slots?: RobotSlot[];
  objects: WorldObject[];
  probes: CaseProbe[];
  success: ContractFormula;
  timeline: ReferenceCommand[];
  controls: CaseControl[];
  route: Route;
  waypoints?: RoutePoint[];
  blockAt?: number;
  target?: { at: V3; radius: number };
}

export interface CaseGoal {
  kind: GoalKind;
  name: string;
  needs: Capability[];
  pair?: boolean;
  params: ParamKey[];
  plan: (robot: BuilderRobot, values: GoalValues, world: WorldKind) => GoalPlan;
  problem?: (robot: BuilderRobot, values: GoalValues) => string | null;
}

export const GOAL_PARAMS: Record<ParamKey, GoalParam> = {
  distanceMm: { key: 'distanceMm', label: 'Distance', unit: 'mm', min: 0, max: 5000, step: 50 },
  heightMm: { key: 'heightMm', label: 'Height', unit: 'mm', min: 0, max: 2000, step: 10 },
  sideMm: { key: 'sideMm', label: 'Side', unit: 'mm', min: -2000, max: 2000, step: 10 },
  radiusMm: { key: 'radiusMm', label: 'Radius', unit: 'mm', min: 5, max: 1000, step: 10 },
  pushMm: { key: 'pushMm', label: 'Push', unit: 'mm', min: 100, max: 5000, step: 50 },
  boxMm: { key: 'boxMm', label: 'Box', unit: 'mm', min: 40, max: 600, step: 10 },
  stops: { key: 'stops', label: 'Spots', unit: '', min: 2, max: 8, step: 1 },
  spacingMm: { key: 'spacingMm', label: 'Spacing', unit: 'mm', min: 200, max: 3000, step: 50 },
  seconds: { key: 'seconds', label: 'Time', unit: 's', min: 2, max: 120, step: 1 },
};

const GOAL_BLUE = '#0d99ff';
const BOX_GREY = '#c8a26a';
const BOX_DENSITY_G_PER_CM3 = 0.05;
const MIN_MARKER_HEIGHT_MM = 40;
const ROBOT_CLEARANCE_MM = 80;
const PATH_SWAY = 0.4;
const GROUND_HOLD_SECONDS = 0.3;
const SPOT_HOLD_SECONDS = 0.2;
const STAND_SHARE = 0.5;
const MIN_WALK_MM = 100;

export const FLOOR_PROBE_DEPTH_MM = 1_000_000;

const ROLL: CaseControl[] = [
  { id: 'move', label: 'Move', input: 'move' },
  { id: 'turn', label: 'Turn', input: 'turn' },
];

export const REACH: CaseControl[] = [
  { id: 'move', label: 'Move', input: 'move' },
  { id: 'lift', label: 'Raise and Lower', input: 'lift' },
];

const WALK_PAST_SHARE = 1.25;

export const BLOCK_DEPTH_MM = 120;

const PUSH_SPEED = 0.3;

export const groundOf = (facts: RobotFacts): Capability | null => {
  if (facts.capabilities.includes('legs')) return 'legs';

  return facts.capabilities.includes('wheels') ? 'wheels' : null;
};

export const near = (signal: string, radius: number): ContractState => ({
  atom: { expr: { signal }, cmp: '<', value: radius, scale: radius },
});

export const holdNear = (signal: string, radius: number, seconds: number): ContractFormula => ({
  hold_for: { seconds, within: 'whole', state: near(signal, radius) },
});

export const marker = (id: string, name: string, at: V3, size: V3): WorldObject => ({
  id,
  name,
  kind: 'cylinder',
  position: at,
  rotation: [0, 0, 0],
  size,
  color: GOAL_BLUE,
  opacity: 0.35,
  behavior: 'marker',
});

const markerHeight = (robot: BuilderRobot) => Math.max(robot.pivot[1], MIN_MARKER_HEIGHT_MM);

const spot = (id: string, name: string, at: { x: number; z: number; radius: number }, robot: BuilderRobot) => {
  const y = markerHeight(robot);

  return marker(id, name, [at.x, y, at.z], [at.radius * 2, y * 2, at.radius * 2]);
};

const front = (robot: BuilderRobot) => robot.pivot[2] + robot.footprint.depth / 2;

const groundSlot = (robot: BuilderRobot): RobotSlot => ({ needs: [groundOf(robot.facts) ?? 'wheels'], binding: {} });

const routeAlong = (robot: BuilderRobot, toZ: number, sway = 0): Route => ({
  from: [robot.pivot[0], 0, front(robot)],
  to: [robot.pivot[0], 0, toZ],
  halfWidth: robot.footprint.width / 2 + sway + ROBOT_CLEARANCE_MM * 2,
});

export const routeClearance = (robot: BuilderRobot) =>
  Math.max(robot.footprint.width, robot.footprint.depth) / 2 + ROBOT_CLEARANCE_MM;

const blockRunUp = (robot: BuilderRobot) =>
  2 * (BLOCK_DEPTH_MM + routeClearance(robot) * 1.2 + robot.footprint.depth + robot.footprint.width);

export const mm = (x: number) => `${Math.round(x)} mm`;

const reachGoal: CaseGoal = {
  kind: 'reach',
  name: 'Reach a Spot',
  needs: ['legs', 'wheels'],
  params: ['distanceMm', 'radiusMm', 'seconds'],
  plan: (robot, v) => {
    const z = robot.pivot[2] + v.distanceMm;

    return {
      brief: `Reach the spot ${mm(v.distanceMm)} ahead and stop on it.`,
      slot: groundSlot(robot),
      objects: [spot('spot', 'Spot', { x: robot.pivot[0], z, radius: v.radiusMm }, robot)],
      probes: [{ signal: 'spot', from: 'base', to: { object: 'spot' } }],
      success: holdNear('spot', v.radiusMm, GROUND_HOLD_SECONDS),
      timeline: [],
      controls: ROLL,
      route: routeAlong(robot, z - v.radiusMm),
      waypoints: [{ at: [robot.pivot[0], robot.pivot[1], z] }],
    };
  },
  problem: (robot, v) =>
    v.distanceMm - v.radiusMm < robot.footprint.depth / 2 ? 'Move the spot farther ahead of the robot.' : null,
};

export function pointProblem(arm: Pick<RobotFacts, 'anchor' | 'reachMm'>, at: V3, v: GoalValues): string | null {
  const { anchor, reachMm } = arm;
  const far = Math.hypot(at[0] - anchor[0], at[1] - anchor[1], at[2] - anchor[2]);

  if (far > reachMm) return `Bring the point within ${mm(reachMm)} of the arm.`;

  return v.heightMm < v.radiusMm ? 'Raise the point off the floor.' : null;
}

export const touchTarget = (robot: BuilderRobot, v: GoalValues): V3 => {
  const anchor = robot.facts.anchor;

  return [anchor[0] + v.sideMm, v.heightMm, anchor[2] + v.distanceMm];
};

const touchGoal: CaseGoal = {
  kind: 'touch',
  name: 'Touch a Point',
  needs: ['arm'],
  params: ['distanceMm', 'heightMm', 'radiusMm', 'seconds'],
  plan: (robot, v) => {
    const { facts } = robot;
    const at = touchTarget(robot, v);

    return {
      brief: 'Touch the point with the end effector.',
      slot: {
        needs: ['arm'],
        minJoints: 2,
        binding: facts.endEffector ? { endEffector: facts.endEffector } : {},
        reachMm: facts.reachMm,
        anchor: facts.anchor,
      },
      objects: [
        {
          ...marker('point', 'Point', at, [v.radiusMm * 2, v.radiusMm * 2, v.radiusMm * 2]),
          kind: 'sphere',
          opacity: 0.6,
        },
      ],
      probes: [{ signal: 'point', from: 'end-effector', to: { object: 'point' } }],
      success: holdNear('point', v.radiusMm, SPOT_HOLD_SECONDS),
      timeline: [{ at: 0.2, target: at }],
      controls: REACH,
      route: { from: [at[0], 0, robot.pivot[2]], to: [at[0], 0, at[2]], halfWidth: v.radiusMm },
      target: { at, radius: v.radiusMm },
    };
  },
  problem: (robot, v) => pointProblem(robot.facts, touchTarget(robot, v), v),
};

const pushGoal: CaseGoal = {
  kind: 'push',
  name: 'Push a Box',
  needs: ['legs', 'wheels'],
  params: ['pushMm', 'boxMm', 'radiusMm', 'seconds'],
  plan: (robot, v, world) => {
    const [x, y] = robot.pivot;
    const runUp = world === 'block' ? blockRunUp(robot) : ROBOT_CLEARANCE_MM;
    const boxZ = front(robot) + v.boxMm / 2 + runUp;
    const goalZ = boxZ + v.pushMm;
    const half = v.boxMm / 2;
    const behind = half + robot.footprint.depth / 2;

    return {
      brief: `Push the box ${mm(v.pushMm)} onto the spot.`,
      slot: groundSlot(robot),
      objects: [
        {
          id: 'box',
          name: 'Box',
          kind: 'box',
          position: [x, half, boxZ],
          rotation: [0, 0, 0],
          size: [v.boxMm, v.boxMm, v.boxMm],
          color: BOX_GREY,
          behavior: 'dynamic',
          massG: Math.round((v.boxMm / 10) ** 3 * BOX_DENSITY_G_PER_CM3),
          friction: 0.3,
        },
        marker('goal', 'Spot', [x, half, goalZ], [v.radiusMm * 2, v.boxMm, v.radiusMm * 2]),
      ],
      probes: [{ signal: 'goal', from: { object: 'box' }, to: { object: 'goal' } }],
      success: holdNear('goal', v.radiusMm, GROUND_HOLD_SECONDS),
      timeline: [],
      controls: ROLL,
      route: routeAlong(robot, goalZ - v.radiusMm),
      waypoints: [
        ...[boxZ - behind - ROBOT_CLEARANCE_MM - robot.footprint.depth, boxZ - behind - ROBOT_CLEARANCE_MM / 2]
          .filter((z) => z > robot.pivot[2] + ROBOT_CLEARANCE_MM)
          .map((z) => ({ at: [x, y, z] as V3 })),
        { at: [x, half, goalZ], speed: PUSH_SPEED, push: 'box' },
      ],
      blockAt: front(robot) + runUp / 2,
    };
  },
};

const pathStop = (robot: BuilderRobot, v: GoalValues, i: number) => ({
  x: robot.pivot[0] + (i % 2 === 0 ? 1 : -1) * v.spacingMm * PATH_SWAY,
  z: robot.pivot[2] + v.spacingMm * (i + 1),
  radius: v.radiusMm,
});

const pathGoal: CaseGoal = {
  kind: 'path',
  name: 'Follow a Path',
  needs: ['legs', 'wheels'],
  params: ['stops', 'spacingMm', 'radiusMm', 'seconds'],
  plan: (robot, v) => {
    const count = Math.round(v.stops);
    const stops = Array.from({ length: count }, (_, i) => pathStop(robot, v, i));

    return {
      brief: `Pass the ${count} spots in order.`,
      slot: groundSlot(robot),
      objects: stops.map((s, i) => spot(`spot${i}`, `Spot ${i + 1}`, s, robot)),
      probes: stops.map((_, i) => ({ signal: `spot${i}`, from: 'base', to: { object: `spot${i}` } })),
      success: { sequence: stops.map((_, i) => holdNear(`spot${i}`, v.radiusMm, SPOT_HOLD_SECONDS)) },
      timeline: [],
      controls: ROLL,
      route: routeAlong(robot, stops[count - 1].z, v.spacingMm * PATH_SWAY + v.radiusMm),
      waypoints: stops.map((s) => ({ at: [s.x, robot.pivot[1], s.z] as V3 })),
    };
  },
};

const walkGoal: CaseGoal = {
  kind: 'walk',
  name: 'Walk Without Falling',
  needs: ['legs'],
  params: ['distanceMm', 'seconds'],
  plan: (robot, v) => ({
    brief: `Walk ${mm(v.distanceMm)} without falling.`,
    slot: { needs: ['legs'], binding: {} },
    objects: [],
    probes: [{ signal: 'travel', from: 'base', to: { point: robot.pivot } }],
    success: {
      eventually: {
        window: 'whole',
        state: { atom: { expr: { signal: 'travel' }, cmp: '>', value: v.distanceMm, scale: v.distanceMm } },
      },
    },
    timeline: [],
    controls: ROLL,
    route: routeAlong(robot, robot.pivot[2] + v.distanceMm),
    waypoints: [{ at: [robot.pivot[0], robot.pivot[1], robot.pivot[2] + v.distanceMm * WALK_PAST_SHARE] }],
  }),
  problem: (_robot, v) => (v.distanceMm < MIN_WALK_MM ? `Walk at least ${mm(MIN_WALK_MM)}.` : null),
};

export function fallGuard(robot: BuilderRobot): { probe: CaseProbe; failure: Contract['failures'][number] } {
  const [x, height, z] = robot.pivot;

  return {
    probe: { signal: 'height', from: 'base', to: { point: [x, -FLOOR_PROBE_DEPTH_MM, z] } },
    failure: {
      label: 'fell',
      formula: {
        eventually: {
          window: 'whole',
          state: {
            atom: {
              expr: { signal: 'height' },
              cmp: '<',
              value: FLOOR_PROBE_DEPTH_MM + height * STAND_SHARE,
              scale: Math.max(height, 1),
            },
          },
        },
      },
    },
  };
}

export const CASE_GOALS: CaseGoal[] = [reachGoal, pushGoal, pathGoal, walkGoal, touchGoal];

export const touchRadius = (reachMm: number) => Math.max(12, reachMm * 0.08);

function touchSpot({ facts, armSpot }: BuilderRobot): Partial<GoalValues> {
  const [x, y, z] = facts.anchor;

  if (!armSpot) return { distanceMm: Math.round(facts.reachMm * 0.6), heightMm: Math.round(y) };

  return {
    distanceMm: Math.round(armSpot[2] - z),
    heightMm: Math.round(armSpot[1]),
    sideMm: Math.round(armSpot[0] - x),
  };
}

const BOX_SHARE = 0.5;
const BOX_OVER_BODY = 1.3;
const MIN_BOX_MM = 60;
const MAX_BOX_MM = 300;

function boxFor(robot: BuilderRobot): number {
  const legs = robot.facts.capabilities.includes('legs');
  const size = Math.max(robot.footprint.width * BOX_SHARE, legs ? robot.pivot[1] * BOX_OVER_BODY : 0);

  return Math.min(MAX_BOX_MM, Math.max(MIN_BOX_MM, Math.round(size / 10) * 10));
}

const AROUND_SECONDS = { legs: 8, wheels: 5 };

export function goalDefaults(kind: GoalKind, robot: BuilderRobot, world: WorldKind = 'floor'): GoalValues {
  const legs = robot.facts.capabilities.includes('legs');
  const reach = robot.facts.reachMm;
  const base: GoalValues = {
    distanceMm: 900,
    heightMm: 0,
    sideMm: 0,
    radiusMm: 160,
    pushMm: 500,
    boxMm: 150,
    stops: 3,
    spacingMm: 600,
    seconds: legs ? 14 : 8,
  };
  const byKind: Record<GoalKind, Partial<GoalValues>> = {
    reach: {},
    push: { radiusMm: 150, boxMm: boxFor(robot), seconds: legs ? 18 : 10 },
    path: { seconds: legs ? 22 : 13 },
    walk: { distanceMm: 500 },
    touch: { ...touchSpot(robot), radiusMm: Math.round(touchRadius(reach)), seconds: 4 },
    handoff: { ...touchSpot(robot), radiusMm: Math.round(touchRadius(reach)), seconds: 7 },
  };

  const values = { ...base, ...byKind[kind] };
  const around = world === 'block' ? AROUND_SECONDS[legs ? 'legs' : 'wheels'] : 0;

  return { ...values, seconds: values.seconds + around };
}
