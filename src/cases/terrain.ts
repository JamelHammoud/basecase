import * as THREE from 'three';
import { sha256Hex } from '../skills/hash';
import { seededRandom, type Random } from '../utils/seededRandom';
import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, GoalPlan, GoalValues } from './caseGoals';
import type { WorldKind } from './caseWorlds';
import { MAX_OBJECTS, type Case, type WorldObject } from './schema';

export const TILE_PREFIX = 'tile-';

const LOW_GREY = 0x5c;
const HIGH_GREY = 0x9a;
const STEP_GREY = '#7a7a7a';
const MIN_TILE_SHARE = 0.2;
const TILE_GAP_MM = 1;
const MAX_TILES = 192;
const TILE_FOOT_SHARE = 0.5;
const TILE_WHEEL_SHARE = 2;
const MIN_TILE_MM = 30;
const TILE_START_SHARE = 0.1;
const PIT_MARGIN_MM = 30;
const RAMP_THICKNESS_MM = 40;
const RUN_UP_SHARE = 0.25;
const MIN_PLATFORM_MM = 120;
const RAMP_SHARE = 1.5;

const onLegs = (robot: BuilderRobot) => robot.facts.capabilities.includes('legs');

const grey = (share: number) => {
  const level = Math.round(LOW_GREY + (HIGH_GREY - LOW_GREY) * share);

  return `#${level.toString(16).padStart(2, '0').repeat(3)}`;
};

const groundBox = (id: string, name: string, position: V3, size: V3): WorldObject => ({
  id,
  name,
  kind: 'box',
  position,
  rotation: [0, 0, 0],
  size,
  color: STEP_GREY,
  behavior: 'static',
});

interface Span {
  x: number;
  halfWidth: number;
  from: number;
  to: number;
}

function spanOf({ route }: GoalPlan, robot: BuilderRobot): Span {
  return {
    x: route.from[0],
    halfWidth: route.halfWidth,
    from: route.from[2] + robot.footprint.depth * TILE_START_SHARE,
    to: route.to[2] + robot.footprint.depth,
  };
}

function tileSize(robot: BuilderRobot, span: Span): number {
  const base = onLegs(robot) ? robot.footSpacingMm * TILE_FOOT_SHARE : robot.pivot[1] * TILE_WHEEL_SHARE;
  const fits = (s: number) => Math.ceil((span.halfWidth * 2) / s) * Math.ceil((span.to - span.from) / s) <= MAX_TILES;
  let size = Math.max(MIN_TILE_MM, Math.round(base));

  while (!fits(size)) size += 5;

  return size;
}

function pitOf(o: WorldObject, tileHalf: number) {
  const grow = PIT_MARGIN_MM + tileHalf;

  return {
    minX: o.position[0] - o.size[0] / 2 - grow,
    maxX: o.position[0] + o.size[0] / 2 + grow,
    minZ: o.position[2] - o.size[2] / 2 - grow,
    maxZ: o.position[2] + o.size[2] / 2 + grow,
  };
}

const roughSeed = (): Random => seededRandom(sha256Hex('rough-ground'));

export function roughGround(plan: GoalPlan, robot: BuilderRobot, values: GoalValues): WorldObject[] {
  const random = roughSeed();
  const span = spanOf(plan, robot);
  const size = tileSize(robot, span);
  const columns = Math.ceil((span.halfWidth * 2) / size);
  const rows = Math.ceil((span.to - span.from) / size);
  const pits = plan.objects.filter((o) => o.behavior === 'dynamic').map((o) => pitOf(o, size / 2));
  const tiles: WorldObject[] = [];

  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const share = MIN_TILE_SHARE + (1 - MIN_TILE_SHARE) * random();
      const x = span.x - span.halfWidth + (column + 0.5) * size;
      const z = span.from + (row + 0.5) * size;
      const height = values.riseMm * share;

      if (!pits.some((p) => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ))
        tiles.push({
          ...groundBox(
            `${TILE_PREFIX}${row}-${column}`,
            'Tile',
            [x, height / 2, z],
            [size - TILE_GAP_MM, height, size - TILE_GAP_MM],
          ),
          color: grey(share),
        });
    }

  return tiles.slice(0, MAX_OBJECTS - plan.objects.length);
}

const platformLength = (robot: BuilderRobot) => Math.max(robot.footprint.depth, MIN_PLATFORM_MM);

const slopeRun = (robot: BuilderRobot) => platformLength(robot) * RAMP_SHARE;

const slopeHeight = (robot: BuilderRobot, values: GoalValues) =>
  slopeRun(robot) * Math.tan(THREE.MathUtils.degToRad(values.inclineDeg));

export function terrainLength(world: WorldKind, robot: BuilderRobot): number {
  if (world === 'steps') return platformLength(robot);

  return world === 'slope' ? platformLength(robot) + 2 * slopeRun(robot) : 0;
}

function middleOf(plan: GoalPlan, robot: BuilderRobot, length: number): number {
  return plan.blockAt ?? plan.route.from[2] + robot.footprint.depth * RUN_UP_SHARE + length / 2;
}

export function steps(plan: GoalPlan, robot: BuilderRobot, values: GoalValues): WorldObject[] {
  const { x, halfWidth } = spanOf(plan, robot);
  const length = platformLength(robot);
  const rise = values.riseMm;

  return [
    groundBox('platform', 'Platform', [x, rise / 2, middleOf(plan, robot, length)], [halfWidth * 2, rise, length]),
  ];
}

interface Ramp {
  x: number;
  foot: number;
  top: number;
  height: number;
  width: number;
}

function ramp(id: string, at: Ramp): WorldObject {
  const run = at.top - at.foot;
  const angle = Math.atan2(at.height, Math.abs(run));
  const sign = Math.sign(run);
  const normal = new THREE.Vector3(0, Math.cos(angle), -sign * Math.sin(angle));
  const middle = new THREE.Vector3(at.x, at.height / 2, (at.foot + at.top) / 2);

  middle.addScaledVector(normal, -RAMP_THICKNESS_MM / 2);

  return {
    ...groundBox(id, 'Ramp', middle.toArray() as V3, [at.width, RAMP_THICKNESS_MM, Math.hypot(run, at.height)]),
    rotation: [-sign * THREE.MathUtils.radToDeg(angle), 0, 0],
  };
}

export function slope(plan: GoalPlan, robot: BuilderRobot, values: GoalValues): WorldObject[] {
  const { x, halfWidth } = spanOf(plan, robot);
  const height = slopeHeight(robot, values);
  const run = slopeRun(robot);
  const top = platformLength(robot);
  const middle = middleOf(plan, robot, terrainLength('slope', robot));
  const width = halfWidth * 2;
  const [up, down] = [middle - top / 2, middle + top / 2];

  return [
    ramp('ramp-up', { x, foot: up - run, top: up, height, width }),
    groundBox('top', 'Top', [x, height / 2, middle], [width, height, top]),
    ramp('ramp-down', { x, foot: down + run, top: down, height, width }),
  ];
}

export function topOf(o: WorldObject): number {
  const turn = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(...(o.rotation.map(THREE.MathUtils.degToRad) as V3), 'XYZ'),
  );
  const e = turn.elements;
  const half = (Math.abs(e[1]) * o.size[0] + Math.abs(e[5]) * o.size[1] + Math.abs(e[9]) * o.size[2]) / 2;

  return o.position[1] + half;
}

export function reseededGround(kase: Case, random: Random): Case {
  const tiles = kase.world.objects.flatMap((o, i) =>
    o.id.startsWith(TILE_PREFIX) && o.behavior === 'static' ? [i] : [],
  );

  if (!tiles.length) return kase;

  const heights = tiles.map((i) => kase.world.objects[i].size[1]);

  for (let i = heights.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));

    [heights[i], heights[j]] = [heights[j], heights[i]];
  }

  const objects = [...kase.world.objects];

  tiles.forEach((index, k) => {
    const o = objects[index];

    objects[index] = {
      ...o,
      position: [o.position[0], heights[k] / 2, o.position[2]],
      size: [o.size[0], heights[k], o.size[2]],
    };
  });

  return { ...kase, world: { ...kase.world, objects } };
}

const RISE_SHARE = { rough: { legs: 0.1, wheels: 0.3 }, steps: { legs: 0.1, wheels: 0.5 } };
const INCLINE_DEG = { legs: 8, wheels: 12 };

const even = (mm: number) => Math.max(2, Math.round(mm / 2) * 2);

export function terrainDefaults(robot: BuilderRobot, world: WorldKind): Pick<GoalValues, 'riseMm' | 'inclineDeg'> {
  const way = onLegs(robot) ? 'legs' : 'wheels';
  const share = RISE_SHARE[world === 'steps' ? 'steps' : 'rough'][way];

  return { riseMm: even(robot.pivot[1] * share), inclineDeg: INCLINE_DEG[way] };
}
