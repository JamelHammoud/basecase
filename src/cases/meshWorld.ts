import type { V3 } from '../utils/kinematics';
import { routeClearance, type BuilderRobot, type GoalKind } from './caseGoals';
import type { CaseWorld } from './caseWorlds';
import { openSpotAmong } from './roomWorld';
import type { WorldObject } from './schema';
import type { MeshWorld, WorldMeshRef, WorldPiece } from './worldTypes';

const MESH_GOALS: ReadonlySet<GoalKind> = new Set(['reach', 'push', 'path', 'walk']);
const PIECE_GREY = '#6e6e6e';

function sizeOf(piece: WorldPiece): V3 {
  const size: V3 = [0, 0, 0];

  for (let i = 0; i < piece.vertices.length; i++) size[i % 3] = Math.max(size[i % 3], Math.abs(piece.vertices[i]) * 2);

  return size;
}

export function pieceObjects(world: MeshWorld, at: V3 = [0, 0, 0]): WorldObject[] {
  return world.pieces.map((piece, i) => ({
    id: `piece-${i}`,
    name: world.name,
    kind: 'box',
    position: piece.center.map((v, k) => v + at[k]) as V3,
    rotation: [0, 0, 0],
    size: sizeOf(piece),
    color: PIECE_GREY,
    behavior: 'static',
    piece: i,
    ...(piece.ground ? { ground: true } : {}),
  }));
}

const bottomOf = (o: WorldObject) => o.position[1] - o.size[1] / 2;

export function worldStart(world: MeshWorld, robot: BuilderRobot): V3 {
  const headroom = robot.heightMm || Infinity;
  const inBand = pieceObjects(world).filter((o) => bottomOf(o) < headroom);

  return openSpotAmong(inBand, world.bounds, routeClearance(robot));
}

export function worldOffset(world: MeshWorld, robot: BuilderRobot): V3 {
  const spot = worldStart(world, robot);

  return [robot.pivot[0] - spot[0], 0, robot.pivot[2] - spot[2]];
}

export const worldRef = (world: MeshWorld, robot: BuilderRobot): WorldMeshRef => ({
  hash: world.hash,
  name: world.name,
  at: worldOffset(world, robot),
});

export function meshWorld(world: MeshWorld): CaseWorld {
  return {
    kind: 'mesh',
    name: world.name,
    suffix: `in ${world.name}`,
    trueSize: true,
    fits: (goal) => MESH_GOALS.has(goal),
    objects: (_plan, robot) => pieceObjects(world, worldOffset(world, robot)),
    mesh: (robot) => worldRef(world, robot),
  };
}
