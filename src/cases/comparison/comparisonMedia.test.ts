import { describe, expect, it } from 'vitest';
import { TopicCollector } from '../../topics/collector';
import { encodeTopicLog } from '../../topics/topicFile';
import { decodeRecording, encodeRecording } from '../recordingFile';
import { comparisonFixture } from './comparisonFixtures';
import { prepareSource, sampleAt } from './comparison';
import { comparisonImageFrame, rawComparisonPixels } from './comparisonImages';
import { comparisonSpatialSession } from './comparisonSpatial';

async function mediaSource(id: string, distance: number, rgb: number[], frame = 'laser') {
  const file = comparisonFixture({ id, times: [0, 1, 2], values: [1, 2, 3] });
  const recording = decodeRecording(file.bytes)!;
  const collector = new TopicCollector();

  for (const i of [0, 1]) {
    collector.add('/camera', 'sensor_msgs/Image', BigInt(i) * 1_000_000_000n, {
      width: 2,
      height: 1,
      encoding: 'rgb8',
      step: 6,
      data: Uint8Array.from([...rgb, ...rgb]),
    });
    collector.add('/grid', 'nav_msgs/OccupancyGrid', BigInt(i) * 1_000_000_000n, {
      header: { frame_id: 'map' },
      info: { width: 1025, height: 1025, resolution: 0.05 },
      data: [],
    });
    collector.add('/scan', 'sensor_msgs/LaserScan', BigInt(i) * 1_000_000_000n, {
      header: { frame_id: frame },
      angle_min: 0,
      angle_max: 0,
      angle_increment: 1,
      range_min: 0.1,
      range_max: 10,
      ranges: [distance + i],
    });
  }

  recording.topics = encodeTopicLog(collector.finish(0n));

  return prepareSource({ stored: file.stored, bytes: encodeRecording(recording) });
}

describe('source-local recorded media', () => {
  it('preserves opposing same-name camera pixels and scan frames in independent consumers', async () => {
    const a = await mediaSource('a', 1, [255, 0, 0]);
    const b = await mediaSource('b', 3, [0, 255, 0]);
    const rule = { kind: 'previous' as const, maxAge: 0.5 };
    const imageA = comparisonImageFrame(a, '/camera', 1, rule)!;
    const imageB = comparisonImageFrame(b, '/camera', 1, rule)!;

    expect(Array.from(rawComparisonPixels(imageA).pixels)).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(Array.from(rawComparisonPixels(imageB).pixels)).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    expect(comparisonImageFrame(a, '/camera', 1.75, rule)).toBeNull();
    expect(comparisonImageFrame(a, '/camera', -1, rule)).toBeNull();

    const spatialA = comparisonSpatialSession();
    const spatialB = comparisonSpatialSession();
    const aNow = spatialA.read(a, '/scan', 1);
    const bNow = spatialB.read(b, '/scan', 1);

    expect(a.channels.some((channel) => channel.id.startsWith('topic./camera.data['))).toBe(false);
    expect(aNow.frame).toBe('laser');
    expect(bNow.frame).toBe('laser');
    expect(aNow.points).toEqual([2000, 0, 0]);
    expect(bNow.points).toEqual([4000, 0, 0]);
    expect(spatialA.read(a, '/scan', 1.1)).toBe(aNow);
    expect(spatialA.read(a, '/scan', 0).points).toEqual([1000, 0, 0]);
    expect(spatialB.read(b, '/scan', 0).points).toEqual([3000, 0, 0]);
  });
  it('keeps signals readable when geometry cannot be registered or exceeds its bounded view', async () => {
    const source = await mediaSource('unmatched', 1, [255, 0, 0], '');
    const spatial = comparisonSpatialSession();
    const rule = { kind: 'previous' as const, maxAge: 0.5 };

    expect(spatial.read(source, '/scan', 1)).toMatchObject({ missing: 'Unmatched frame', points: [] });
    expect(spatial.read(source, '/grid', 1)).toMatchObject({ missing: 'Geometry limit', points: [] });
    expect(sampleAt(source, 'topic./camera.width', 1, rule)).toMatchObject({ status: 'sample', value: 2 });

    const image = comparisonImageFrame(source, '/camera', 1, rule)!;

    expect(() => rawComparisonPixels({ ...image, bytes: Uint8Array.of(1) })).toThrow();
    expect(rawComparisonPixels(image).pixels.slice(0, 4)).toEqual(Uint8ClampedArray.of(255, 0, 0, 255));
  });
});
