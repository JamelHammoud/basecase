import { describe, expect, it, vi } from 'vitest';
import { TopicCollector } from '../topics/collector';
import { TopicIndex } from '../topics/topicIndex';
import { topicMap } from './mapFeed';

function recording(sensors: number) {
  const topics = new TopicCollector();

  for (let sensor = 0; sensor < sensors; sensor++) {
    for (const [i, at] of [2, 0, 1, 1].entries()) {
      topics.add(`/scan/${String(sensor).padStart(3, '0')}`, 'sensor_msgs/LaserScan', BigInt(at) * 1_000_000_000n, {
        header: { frame_id: 'map' },
        angle_min: 0,
        angle_increment: 1,
        range_min: 0.1,
        range_max: 10,
        ranges: Float64Array.of(1 + sensor * 0.01 + i * 0.001),
      });
    }
  }

  return new TopicIndex(topics.finish(0n));
}

function expected(index: TopicIndex) {
  return index.topics
    .flatMap((topic, sensor) =>
      Array.from(topic.t, (at, i) => ({ at, sensor, i, x: Math.fround(topic.lists.get('ranges')!.v[i]) })),
    )
    .sort((a, b) => a.at - b.at || a.sensor - b.sensor || a.i - b.i)
    .map(({ at, x }) => ({ at, x }));
}

function mapped(index: TopicIndex) {
  const samples: { at: number; x: number }[] = [];
  const result = topicMap(index, { match: false }, ({ at, points }) => samples.push({ at, x: points[0] }));

  return { result, samples };
}

describe('recorded map sensor ordering', () => {
  it('retains chronological, sensor and duplicate-message order across edits and repeated maps', () => {
    const index = recording(5);
    const before = structuredClone(index.topics);
    const first = mapped(index);
    const second = mapped(index);

    expect(first.samples).toEqual(expected(index));
    expect(second).toEqual(first);
    expect(index.topics).toEqual(before);

    index.topics.reverse();
    index.topics[0].t[0] = -1;
    index.topics[0].lists.get('ranges')!.v[0] = 4;

    expect(mapped(index).samples).toEqual(expected(index));
    expect(first.samples).toEqual(expected(new TopicIndex({ topics: before })));
    expect(topicMap(new TopicIndex({ topics: [] }))).toBeNull();
  });

  it.each([128, 256])('orders synchronized readings from %i sensors without searching their list', (sensors) => {
    const index = recording(sensors);
    const search = vi.spyOn(Array.prototype, 'indexOf');
    let sensorSearches: number;

    try {
      const built = mapped(index);

      sensorSearches = search.mock.calls.filter(([value]) => value && typeof value.read === 'function').length;
      expect(built.samples).toEqual(expected(index));
      expect(built.result!.placed).toHaveLength(sensors * 4);
    } finally {
      search.mockRestore();
    }

    expect(sensorSearches).toBe(0);
  });
});
