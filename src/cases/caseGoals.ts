import type { V3 } from '../utils/kinematics';
import type { Contract } from './contract';
import type { Formula as ContractFormula, State as ContractState } from '../skills/contract';
import type { RobotFacts } from './robotFit';
import type { WorldKind } from './caseWorlds';
import type { RoutePoint } from './groundRoute';
import { DOT_COUNT } from './dotSpots';
import type { GoalParam, GoalValues, ParamKey } from './goalParams';
import { pickGoalWith } from './pickGoal';
import { FLOOR_PROBE_DEPTH_MM } from './probes';
import type { CaseControl, CaseProbe, Capability, ReferenceCommand, RobotSlot, WorldObject } from './schema';

export type GoalKind = 'reach' | 'touch' | 'push' | 'path' | 'walk' | 'pick' | 'handoff';

export type { GoalParam, GoalValues, ParamKey } from './goalParams';

const GOAL_PARAMS: Record<ParamKey, GoalParam> = {
  dots: { key: 'dots', label: 'Dots', unit: '', min: 1, max: DOT_COUNT, step: 1 },
  distanceMm: { key: 'distanceMm', label: 'Distance', unit: 'mm', min: 0, max: 5000, step: 50 },
  heightMm: { key: 'heightMm', label: 'Height', unit: 'mm', min: 0, max: 2000, step: 10 },
  sideMm: { key: 'sideMm', label: 'Side', unit: 'mm', min: -2000, max: 2000, step: 10 },
  radiusMm: { key: 'radiusMm', label: 'Radius', unit: 'mm', min: 5, max: 1000, step: 10 },
  pushMm: { key: 'pushMm', label: 'Push', unit: 'mm', min: 100, max: 5000, step: 50 },
  boxMm: { key: 'boxMm', label: 'Box', unit: 'mm', min: 40, max: 600, step: 10 },
  stops: { key: 'stops', label: 'Spots', unit: '', min: 2, max: 8, step: 1 },
  spacingMm: { key: 'spacingMm', label: 'Spacing', unit: 'mm', min: 200, max: 3000, step: 50 },
  seconds: { key: 'seconds', label: 'Time', unit: 's', min: 2, max: 120, step: 1 },
  riseMm: { key: 'riseMm', label: 'Height', unit: 'mm', min: 2, max: 500, step: 2 },
  inclineDeg: { key: 'inclineDeg', label: 'Incline', unit: '°', min: 2, max: 40, step: 1 },
};

export interface BuilderRobot {
  facts: RobotFacts;
  pivot: V3;
  forward: V3;
  footprint: { width: number; depth: number };
  footSpacingMm: number;
  armSpots: V3[];
  partner?: BuilderRobot;
  heightMm: number;
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

export interface GoalSpot {
  at: V3;
  phrase: string;
}

export type GoalSpots = Array<GoalSpot | null>;

export interface CaseGoal {
  kind: GoalKind;
  name: string;
  needs: Capability[];
  pair?: boolean;
  params: ParamKey[];
  plan: (robot: BuilderRobot, values: GoalValues, world: WorldKind, spots?: GoalSpots) => GoalPlan;
  fields?: (values: GoalValues) => ParamKey[];
  title?: (values: GoalValues) => string;
  problem?: (robot: BuilderRobot, values: GoalValues) => string | null;
  bounds?: Partial<Record<ParamKey, Pick<GoalParam, 'min'>>>;
}

export const goalParam = (goal: CaseGoal, key: ParamKey): GoalParam => ({ ...GOAL_PARAMS[key], ...goal.bounds?.[key] });

const GOAL_BLUE = '#0d99ff';
const BOX_GREY = '#c8a26a';
const BOX_DENSITY_G_PER_CM3 = 0.05;
const MIN_MARKER_HEIGHT_MM = 40;
const ROBOT_CLEARANCE_MM = 80;
const PATH_SWAY = 0.4;
const GROUND_HOLD_SECONDS = 0.3;
const SPOT_HOLD_SECONDS = 0.2;
const DOT_START_SECONDS = 0.2;

export const DOT_MOVE_SECONDS = 1.8;

const STAND_SHARE = 0.5;
const MIN_WALK_MM = 100;

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
  plan: (robot, v, _world, [named] = []) => {
    const [x, z] = named ? [named.at[0], named.at[2]] : [robot.pivot[0], robot.pivot[2] + v.distanceMm];
    const where = named ? named.phrase : `${mm(v.distanceMm)} ahead`;

    return {
      brief: `Reach the spot ${where} and stop on it.`,
      slot: groundSlot(robot),
      objects: [spot('spot', 'Spot', { x, z, radius: v.radiusMm }, robot)],
      probes: [{ signal: 'spot', from: 'base', to: { object: 'spot' } }],
      success: holdNear('spot', v.radiusMm, GROUND_HOLD_SECONDS),
      timeline: [],
      controls: ROLL,
      route: routeAlong(robot, z - v.radiusMm),
      waypoints: [{ at: [x, robot.pivot[1], z] }],
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

const dotCount = (v: GoalValues) => Math.round(v.dots);

function touchDots(robot: BuilderRobot, v: GoalValues): V3[] {
  const spots = robot.armSpots.slice(0, dotCount(v));

  return dotCount(v) > 1 && spots.length > 1 ? spots : [touchTarget(robot, v)];
}

const dotMarker = (id: string, name: string, at: V3, radius: number): WorldObject => ({
  ...marker(id, name, at, [radius * 2, radius * 2, radius * 2]),
  kind: 'sphere',
  opacity: 0.6,
});

const touchGoal: CaseGoal = {
  kind: 'touch',
  name: 'Touch a Point',
  needs: ['arm'],
  params: ['dots', 'distanceMm', 'heightMm', 'radiusMm', 'seconds'],
  fields: (v) => (dotCount(v) > 1 ? ['dots', 'radiusMm', 'seconds'] : touchGoal.params),
  title: (v) => (dotCount(v) > 1 ? 'Touch the Dots' : touchGoal.name),
  plan: (robot, v) => {
    const { facts } = robot;
    const dots = touchDots(robot, v);
    const several = dots.length > 1;
    const ids = dots.map((_, i) => (several ? `dot${i}` : 'point'));
    const lowest = dots.reduce((low, d) => (d[1] < low[1] ? d : low));

    return {
      brief: several ? 'Touch each dot in order with the end effector.' : 'Touch the point with the end effector.',
      slot: {
        needs: ['arm'],
        minJoints: 2,
        binding: facts.endEffector ? { endEffector: facts.endEffector } : {},
        reachMm: facts.reachMm,
        anchor: facts.anchor,
      },
      objects: dots.map((at, i) => dotMarker(ids[i], several ? `Dot ${i + 1}` : 'Point', at, v.radiusMm)),
      probes: ids.map((id) => ({ signal: id, from: 'end-effector', to: { object: id } })),
      success: several
        ? { sequence: ids.map((id) => holdNear(id, v.radiusMm, SPOT_HOLD_SECONDS)) }
        : holdNear('point', v.radiusMm, SPOT_HOLD_SECONDS),
      timeline: dots.map((target, i) => ({ at: DOT_START_SECONDS + i * DOT_MOVE_SECONDS, target })),
      controls: REACH,
      route: { from: [lowest[0], 0, robot.pivot[2]], to: [lowest[0], 0, lowest[2]], halfWidth: v.radiusMm },
      target: { at: lowest, radius: v.radiusMm },
    };
  },
  problem: (robot, v) => {
    if (dotCount(v) === 1) return pointProblem(robot.facts, touchTarget(robot, v), v);

    return robot.armSpots.length < dotCount(v) ? `Set Dots to ${Math.max(1, robot.armSpots.length)} or fewer.` : null;
  },
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
  plan: (robot, v, _world, spots = []) => {
    const count = Math.round(v.stops);
    const stops = Array.from({ length: count }, (_, i) => {
      const named = spots[i];

      return named ? { x: named.at[0], z: named.at[2], radius: v.radiusMm } : pathStop(robot, v, i);
    });

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

const pickGoal = pickGoalWith([...REACH, { id: 'grip', label: 'Grip', input: 'grip' }]);

export const CASE_GOALS: CaseGoal[] = [reachGoal, pushGoal, pathGoal, walkGoal, touchGoal, pickGoal];
