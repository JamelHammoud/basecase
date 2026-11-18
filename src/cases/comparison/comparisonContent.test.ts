import { describe, expect, it } from 'vitest';
import { encodeTopicLog } from '../../topics/topicFile';
import { recordedTopic } from '../../topics/topicFixtures';
import { decodeRecording, encodeRecording } from '../recordingFile';
import { comparisonFixture } from './comparisonFixtures';
import { prepareSource, sampleAt, type ComparisonChannel } from './comparison';
import { comparisonJobs } from './comparisonJobs';
import { preparePlot } from './comparisonPlots';
import { comparisonUnit } from './comparisonUnits';

const rule = { kind: 'previous' as const, maxAge: 0.25 };

describe('bounded comparison content', () => {
  it('retains extrema, missing samples and actual time gaps within the prepared plot cap', () => {
    const times = Float64Array.from({ length: 10_000 }, (_, i) => i / 100);
    const values = new Float64Array(times.length);

    values[100] = 417;
    values[9000] = -831;
    values[5000] = Number.NaN;

    const channel: ComparisonChannel = { id: 'signal', unit: 'm', kind: 'number', t: times, values, clipped: false };
    const plot = preparePlot(channel, rule);

    expect(plot.v.length).toBeLessThanOrEqual(2048);
    expect(plot.t).toHaveLength(plot.v.length);
    expect(plot.v).toContain(417);
    expect(plot.v).toContain(-831);
    expect(plot.v.some(Number.isNaN)).toBe(true);
    expect(preparePlot({ ...channel, t: [0, 1, 10], values: [2, 3, 4] }, rule)).toEqual({
      t: [0, 0.5, 1, 5.5, 10],
      v: [2, Number.NaN, 3, Number.NaN, 4],
    });
    expect(preparePlot({ ...channel, kind: 'state' }, rule)).toEqual({ t: [], v: [] });
  });

  it('keeps absent message fields absent and marks bounded content explicitly', async () => {
    const file = comparisonFixture({ id: 'a', times: [0, 1, 2], values: [4, 5, 6] });
    const recording = decodeRecording(file.bytes)!;
    const topic = recordedTopic('/optional', 'custom', [0, 1, 2], { numbers: { speed: [4, 0, 6] } });

    topic.presence = new Map([['number:speed', Uint8Array.of(5)]]);
    recording.topics = encodeTopicLog({ topics: [topic] });

    const bytes = encodeRecording(recording);
    const source = await prepareSource({ stored: file.stored, bytes });
    const jobs = comparisonJobs();

    await jobs.open({ stored: file.stored, bytes });
    expect(sampleAt(source, 'topic./optional.speed', 1, rule).status).toBe('missing');
    expect(jobs.seek({ time: 1, topic: '/optional', rule }).result.message.nodes).toEqual([]);
    expect(jobs.seek({ time: 2, topic: '/optional', rule }).result.message.nodes).toContainEqual({
      key: 'speed',
      value: '6',
    });
    expect(comparisonUnit('custom', 'angular_velocity.x')).toBeNull();
    expect(comparisonUnit('nav_msgs/msg/Odometry', 'pose.pose.position.x')).toBe('m');
    expect(comparisonUnit('nav_msgs/msg/Odometry', 'pose.pose.orientation.x')).toBeNull();
  });

  it('bounds state and message text without changing the stored source', async () => {
    const file = comparisonFixture({ id: 'a', times: [0, 1, 2], values: [1, 2, 3] });
    const recording = decodeRecording(file.bytes)!;
    const long = 'recorded-state-'.repeat(1000);
    const topic = recordedTopic('/mode', 'std_msgs/msg/String', [0, 1, 2], {
      labels: { data: ['idle', long, 'done'] },
    });

    recording.topics = encodeTopicLog({ topics: [topic] });

    const bytes = encodeRecording(recording);
    const original = bytes.slice();
    const jobs = comparisonJobs();
    const opened = await jobs.open({ stored: file.stored, bytes });
    const snapshot = jobs.seek({ time: 1, rule, topic: '/mode' }).result;

    expect(snapshot.samples[0]).toMatchObject({ value: long.slice(0, 256), clipped: true });
    expect(snapshot.message).toMatchObject({ nodes: [{ key: 'data', value: long.slice(0, 256) }], clipped: true });
    expect(opened.result.events.find((event) => event.id === 'topic./mode.data:1')?.clipped).toBe(true);
    expect(bytes).toEqual(original);
    await expect(jobs.open({ stored: { ...file.stored, frames: 4 }, bytes })).rejects.toThrow();
  });
});
