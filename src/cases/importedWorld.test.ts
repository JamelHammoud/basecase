import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, worldsFor } from './caseBuilder';
import { groundRoute } from './groundRoute';
import { importedPlacement, importedScenery, openWorldSpot } from './importedWorld';
import type { WorldAsset } from './worldAssets';

const hash = 'a'.repeat(64);
const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
const robot = builderRobot(buildRig(rover.joints, rover.parts), rover.parts);
const box = (min: V3, max: V3) => ({
  positions: new Float32Array([
    min[0],
    min[1],
    min[2],
    max[0],
    min[1],
    min[2],
    max[0],
    min[1],
    max[2],
    min[0],
    min[1],
    max[2],
    min[0],
    max[1],
    min[2],
    max[0],
    max[1],
    min[2],
    max[0],
    max[1],
    max[2],
    min[0],
    max[1],
    max[2],
  ]),
  indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6]),
});
const floor = box([-2000, -20, -2000], [2000, 0, 2000]);
const table = box([-500, 700, -500], [500, 750, 500]);
const leg = box([350, 0, 350], [450, 700, 450]);
const asset: WorldAsset = {
  world: {
    kind: 'mesh',
    name: 'Kitchen',
    mesh: {
      ...floor,
      normals: new Float32Array(floor.positions.length),
      groups: [],
      materials: [],
      bounds: { min: [-2000, -20, -2000], max: [2000, 750, 2000] },
    },
    transform: { scale: 1000, quaternion: [0, 0, 0, 1], translation: [0, 0, 0] },
  },
  pieces: [floor, table, leg],
};

const imported = { hash, asset };

describe('imported worlds in Cases', () => {
  it('prefers a recorded sensor origin on clear supported floor and falls back when it is blocked', () => {
    const captured: WorldAsset = {
      ...asset,
      world: {
        ...asset.world,
        reconstruction: {
          version: 1,
          sourceTry: 'scan',
          frame: 'map',
          matching: true,
          resolutionM: 0.1,
          method: 'occupied-voxels',
          unknown: 'unobserved',
          occupied: [],
          free: [],
          origins: [[1, 0, 0]],
          estimates: { floor: true, obstacleHeightM: 1 },
        },
      },
    };

    expect(openWorldSpot(captured, robot)).toEqual([1000, 0, 0]);

    const blocked: WorldAsset = { ...captured, pieces: [...captured.pieces, box([800, 0, -200], [1200, 1000, 200])] };

    expect(openWorldSpot(blocked, robot)).toEqual([0, 0, 0]);
  });

  it('places a rover on clear floor beneath a tabletop without discarding its legs', () => {
    expect(openWorldSpot(asset, robot)).toEqual([0, 0, 0]);
    expect(importedScenery(imported, robot)).toHaveLength(1);
    expect(importedScenery(imported, robot)[0].position[1]).toBe(350);
    expect(importedPlacement(imported, robot)).toEqual([robot.pivot[0], 0, robot.pivot[2]]);
  });

  it('routes beneath the tabletop and around its leg, keeping floor out of the route', () => {
    const scenery = importedScenery(imported, robot);
    const routeRobot = { start: robot.pivot, clearanceMm: 100, headroomMm: robot.heightMm };
    const straight = { at: [0, robot.pivot[1], 1000] as V3 };
    const blocked = { at: [800, robot.pivot[1], 800] as V3 };

    expect(groundRoute([straight], scenery, routeRobot)).toEqual([straight]);
    expect(groundRoute([blocked], scenery, routeRobot).length).toBeGreaterThan(1);
  });

  it('uses the file name, offers ground goals and stores one asset reference at true size', () => {
    expect(worldsFor('reach', robot, undefined, imported).at(-1)?.name).toBe('Kitchen');

    const result = buildCase({ goal: 'reach', world: 'imported', imported }, robot);

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.kase.name).toBe('Reach a Spot in Kitchen');
    expect(result.kase.world.imported).toEqual({ hash, position: importedPlacement(imported, robot) });
    expect(result.kase.world.objects).toHaveLength(1);
    expect(result.kase.slot?.reachMm).toBeUndefined();
  });

  it('keeps the robot footprint on supported floor when the middle is a hole', () => {
    const gap = {
      ...asset,
      pieces: [box([-2000, -20, -2000], [-200, 0, 2000]), box([200, -20, -2000], [2000, 0, 2000])],
    };
    const spot = openWorldSpot(gap, robot);

    expect(spot).not.toBeNull();
    expect(Math.abs(spot![0])).toBeGreaterThanOrEqual(200 + robot.footprint.width / 2);
  });

  it('refuses a world with no clear robot start instead of dropping collision pieces', () => {
    const crowded = { ...asset, pieces: [floor, box([-2000, 0, -2000], [2000, 1000, 2000])] };
    const result = buildCase({ goal: 'reach', world: 'imported', imported: { hash, asset: crowded } }, robot);

    expect(result).toEqual({ ok: false, problem: 'Kitchen has no clear floor for this robot.' });
  });
});
