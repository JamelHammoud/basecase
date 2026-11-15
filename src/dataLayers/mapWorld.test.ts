import { TopicCollector } from '../topics/collector';
import { encodeTopicLog } from '../topics/topicFile';
import { mapJobs } from './mapJobs';
import { beforeAll, describe, expect, it } from 'vitest';
import { readMcap } from '../datasets/import/recordingFiles';
import { writeMcap } from '../datasets/import/mcapFixtures';
import { hashWorldAsset, restoreWorldAssets, serializeWorldAssets, type WorldAsset } from '../cases/worldAssets';
import { hullBounds } from '../cases/worldSurfaces';
import { corridorMcap } from './mapFixtures';
import { depthRoomMessages, stairMessages, STEPS, STEP_RISE_M } from './mapScenes';
import { reconstructMapWorld, type MapWorldRequest } from './mapWorld';

const request = async (bytes: Uint8Array): Promise<MapWorldRequest> => {
  const [recording] = (await readMcap([{ name: 'scan.mcap', bytes }])).episodes;

  return { topics: recording.topics!, sourceTry: 'scan-try', name: 'Scan', matching: true };
};

const contains = (piece: { positions: Float32Array }, point: number[]) => {
  const { min, max } = hullBounds(piece.positions);

  return point.every((v, axis) => v >= min[axis] && v <= max[axis]);
};

let corridor: MapWorldRequest;
let depth: MapWorldRequest;
let stairs: MapWorldRequest;
let corridorAsset: WorldAsset;

beforeAll(async () => {
  const bytes = await Promise.all([corridorMcap(), writeMcap(depthRoomMessages()), writeMcap(stairMessages())]);

  [corridor, depth, stairs] = await Promise.all(bytes.map(request));
  corridorAsset = await reconstructMapWorld(corridor);
});

describe('recorded scan reconstruction', () => {
  it('keeps corridor walls around an open route and identifies authored floor and height', async () => {
    const { world, pieces } = corridorAsset;

    expect(pieces.length).toBeLessThanOrEqual(64);
    expect(pieces.some((piece) => contains(piece, [4000, 400, 1000]))).toBe(true);
    expect(pieces.some((piece) => contains(piece, [4000, 400, 0]))).toBe(false);
    expect(world.reconstruction?.estimates).toEqual({ floor: true, obstacleHeightM: 1 });
    expect(world.reconstruction?.free.length).toBeGreaterThan(100);
    expect(world.reconstruction?.unknown).toBe('unobserved');
    expect(world.reconstruction?.origins.length).toBeGreaterThan(300);
  });

  it('preserves the measured depth floor without claiming an estimate', async () => {
    const { world, pieces } = await reconstructMapWorld(depth);

    expect(world.reconstruction?.estimates).toEqual({ floor: false, obstacleHeightM: null });
    expect(pieces.some((piece) => contains(piece, [1500, -10, 0]))).toBe(true);
    expect(pieces.some((piece) => contains(piece, [500, 400, 500]))).toBe(false);
    expect(pieces.some((piece) => contains(piece, [0, -10, 0]))).toBe(false);
    expect(world.reconstruction?.free.length).toBeGreaterThan(1000);
  });

  it('retains each point-cloud stair level without filling the space above it', async () => {
    const { world, pieces } = await reconstructMapWorld(stairs);
    const tops = pieces.map((piece) => hullBounds(piece.positions).max[1] / 1000);

    for (let step = 0; step <= STEPS; step++)
      expect(tops.some((height) => Math.abs(height - step * STEP_RISE_M) <= 0.051)).toBe(true);

    expect(world.reconstruction?.origins).toEqual([]);
    expect(world.reconstruction?.estimates.floor).toBe(false);
  });

  it('hashes the frozen evidence identically and restores it without its recording', async () => {
    const first = corridorAsset;
    const second = await reconstructMapWorld(corridor);
    const hash = await hashWorldAsset(first);
    const restored = await restoreWorldAssets(serializeWorldAssets({ [hash]: first }));

    expect(await hashWorldAsset(second)).toBe(hash);
    expect(restored[hash].world.reconstruction).toEqual(first.world.reconstruction);
    expect(await hashWorldAsset(restored[hash])).toBe(hash);
  });

  it('refuses clipped sensor evidence rather than silently omitting obstacles', async () => {
    const topics = new TopicCollector();

    topics.add('/scan', 'sensor_msgs/LaserScan', 0n, {
      header: { frame_id: 'map' },
      angle_min: 0,
      angle_increment: 1,
      range_min: 0.1,
      range_max: 10,
      ranges: Float64Array.of(1),
    });

    const log = topics.finish(0n);

    log.topics[0].clipped = true;
    await expect(
      reconstructMapWorld({ topics: encodeTopicLog(log), sourceTry: 'clipped', name: 'Map', matching: true }),
    ).rejects.toThrow(/unclipped/);
  });

  it('refuses more than 64 disconnected surfaces through the mapping worker without replacing a world', async () => {
    const points = Float32Array.from(Array.from({ length: 65 }, (_, i) => [i * 0.3, 0, 0]).flat());
    const topics = new TopicCollector();

    topics.add('/points', 'sensor_msgs/PointCloud2', 0n, {
      header: { frame_id: 'map' },
      width: 65,
      height: 1,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
      is_bigendian: false,
      point_step: 12,
      row_step: points.byteLength,
      data: new Uint8Array(points.buffer),
    });

    await expect(
      mapJobs().makeWorld({
        topics: encodeTopicLog(topics.finish(0n)),
        sourceTry: 'large',
        name: 'Map',
        matching: false,
      }),
    ).rejects.toThrow(/pieces budget/);
  });

  it('refuses unsupported recordings and geometry budgets without returning partial assets', async () => {
    await expect(reconstructMapWorld({ ...corridor, maxPieces: 1 })).rejects.toThrow(/64|budget|pieces/);
    await expect(reconstructMapWorld({ ...corridor, topics: new Uint8Array() })).rejects.toThrow();
  });
});
