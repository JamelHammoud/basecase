import { describe, expect, it } from 'vitest';
import { readMcap } from '../datasets/import/recordingFiles';
import { ROS2_POINT_CLOUD2 } from '../datasets/import/decode/fixtures';
import { writeMcap } from '../datasets/import/mcapFixtures';
import { cdrMessage } from '../datasets/import/topicFixtures';
import type { Recording } from '../sim/recorder';
import { LiveMap, tryMap } from './mapClient';

async function planeTry(): Promise<Recording> {
  const messages = [0, 0.04].map((height, stamp) => {
    const points = Float32Array.from(
      Array.from({ length: 1600 }, (_, i) => [(i % 40) * 0.025, Math.floor(i / 40) * 0.025, height]).flat(),
    );

    return cdrMessage(ROS2_POINT_CLOUD2, '/points', [
      stamp,
      {
        header: { frame_id: 'map' },
        height: 1,
        width: 1600,
        fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
        is_bigendian: false,
        point_step: 12,
        row_step: points.byteLength,
        data: new Uint8Array(points.buffer),
      },
    ]);
  });
  const [episode] = (await readMcap([{ name: 'plane.mcap', bytes: await writeMcap(messages) }])).episodes;

  return { topics: episode.topics } as Recording;
}

describe('map worker client', () => {
  it('updates occupied centroids and keeps previous snapshots intact', async () => {
    const live = new LiveMap();

    await live.add(Float32Array.of(10, 10, -10));

    const first = live.cloud();

    expect(await live.add(Float32Array.of(30, 30, -30))).toBe(true);
    expect(live.cloud().points[0]).toBeCloseTo(0.02);
    expect(live.cloud().points[1]).toBeCloseTo(0.02);
    expect(live.cloud().points[2]).toBeCloseTo(0.02);
    expect(first.points[0]).toBeCloseTo(0.01);
    live.end();
  });

  it('does not resurrect a live session after it ends', async () => {
    const live = new LiveMap();
    const pending = live.add(Float32Array.of(0, 0, 0));

    live.end();
    expect(await pending).toBe(false);
    expect(await live.add(Float32Array.of(100, 0, 0))).toBe(false);
    expect(live.cloud().points).toHaveLength(0);
  });

  it('caches each matching choice separately for the same try', async () => {
    const recording = await planeTry();
    const matched = await tryMap(recording, [], true);
    const raw = await tryMap(recording, [], false);

    expect(raw!.points).not.toEqual(matched!.points);
    expect(await tryMap(recording, [], true)).toBe(matched);
    expect(await tryMap(recording, [], false)).toBe(raw);
  });
});
