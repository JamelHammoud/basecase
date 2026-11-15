import type { V3 } from '../utils/kinematics';
import { routeClearance, type BuilderRobot, type GoalKind } from './caseGoals';
import type { CaseWorld } from './caseWorlds';
import { occupied } from './groundRoute';
import type { WorldObject } from './schema';
import type { WorldAsset } from './worldAssets';
import { FLOOR_TOLERANCE_MM, floorSupport, hullBounds, terrainPieces, type SurfaceBounds } from './worldSurfaces';

export interface ImportedCaseWorld {
  hash: string;
  asset: WorldAsset;
}

const GROUND_GOALS: ReadonlySet<GoalKind> = new Set(['reach', 'push', 'path', 'walk']);
const GRID_STEPS = 120;
const MIN_GRID_MM = 50;

interface WorldPlanning {
  spot: V3 | null;
  objects: WorldObject[];
}

const cache = new WeakMap<WorldAsset, Map<string, WorldPlanning>>();

function obstacle(bounds: SurfaceBounds, index: number): WorldObject {
  const { min, max } = bounds;

  return {
    id: `world-piece-${index}`,
    name: 'World',
    kind: 'box',
    position: min.map((v, i) => (v + max[i]) / 2) as V3,
    rotation: [0, 0, 0],
    size: min.map((v, i) => max[i] - v) as V3,
    color: '#6e6e6e',
    behavior: 'static',
  };
}

function planningObjects(asset: WorldAsset, robot: BuilderRobot, terrain = new Set<number>()): WorldObject[] {
  return asset.pieces.flatMap((piece, index) => {
    const bounds = hullBounds(piece.positions);
    const crossesHeight = bounds.max[1] > FLOOR_TOLERANCE_MM && bounds.min[1] < robot.heightMm;

    return crossesHeight && !terrain.has(index) ? [obstacle(bounds, index)] : [];
  });
}

function candidates({ min, max }: SurfaceBounds, clearance: number): V3[] {
  const centre: V3 = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
  const step = Math.max(MIN_GRID_MM, Math.max(max[0] - min[0], max[2] - min[2]) / GRID_STEPS);
  const spots: V3[] = [];

  for (let x = min[0] + clearance; x <= max[0] - clearance; x += step)
    for (let z = min[2] + clearance; z <= max[2] - clearance; z += step) spots.push([x, 0, z]);

  const distance = (p: V3) => Math.hypot(p[0] - centre[0], p[2] - centre[2]);

  return [centre, ...spots.sort((a, b) => distance(a) - distance(b))];
}

function planning(asset: WorldAsset, robot: BuilderRobot): WorldPlanning {
  const key = [robot.footprint.width, robot.footprint.depth, robot.heightMm].join('|');
  const stored = cache.get(asset) ?? new Map<string, WorldPlanning>();
  const previous = stored.get(key);

  if (previous) return previous;

  const blocked = planningObjects(asset, robot);
  const objects = planningObjects(asset, robot, terrainPieces(asset.pieces));
  const supported = floorSupport(asset.pieces);
  const clearance = routeClearance(robot);
  const bounds = asset.world.mesh.bounds;
  const within = (p: V3) =>
    p[0] >= bounds.min[0] + clearance &&
    p[0] <= bounds.max[0] - clearance &&
    p[2] >= bounds.min[2] + clearance &&
    p[2] <= bounds.max[2] - clearance;
  const halfX = robot.footprint.width / 2;
  const halfZ = robot.footprint.depth / 2;
  const onFloor = (p: V3) =>
    [
      [0, 0],
      [-halfX, -halfZ],
      [-halfX, halfZ],
      [halfX, -halfZ],
      [halfX, halfZ],
    ].every(([x, z]) => supported([p[0] + x, 0, p[2] + z]));
  const clear = (p: V3) => within(p) && !occupied(p, blocked, clearance) && onFloor(p);
  const centre: V3 = [(bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2];
  const spot = clear(centre) ? centre : (candidates(bounds, clearance).find(clear) ?? null);
  const result = { spot, objects };

  stored.set(key, result);
  cache.set(asset, stored);

  return result;
}

export const openWorldSpot = (asset: WorldAsset, robot: BuilderRobot): V3 | null => planning(asset, robot).spot;

export function importedPlacement({ asset }: ImportedCaseWorld, robot: BuilderRobot): V3 {
  const spot = openWorldSpot(asset, robot) ?? [0, 0, 0];

  return [robot.pivot[0] - spot[0], 0, robot.pivot[2] - spot[2]];
}

export function importedScenery(imported: ImportedCaseWorld, robot: BuilderRobot): WorldObject[] {
  const offset = importedPlacement(imported, robot);

  return planning(imported.asset, robot).objects.map((o) => ({
    ...o,
    position: o.position.map((v, axis) => v + offset[axis]) as V3,
  }));
}

export function importedWorld({ asset }: ImportedCaseWorld): CaseWorld {
  return {
    kind: 'imported',
    name: asset.world.name,
    suffix: `in ${asset.world.name}`,
    trueSize: true,
    fits: (goal) => GROUND_GOALS.has(goal),
    objects: () => [],
  };
}
