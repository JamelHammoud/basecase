import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { writeMcap, type FixtureMessage } from '../../datasets/import/mcapFixtures';
import { readMcap } from '../../datasets/import/recordingFiles';
import { decodeRecording, encodeRecording } from '../recordingFile';
import { alignmentOffset, differenceAt, prepareSource, sampleAt, sourceTime } from './comparison';
import { comparisonFixture } from './comparisonFixtures';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function imported(options: { id: string; start: number; values: number[]; states: string[] }) {
  const { id, start, values, states } = options;
  const messages: FixtureMessage[] = values.flatMap((value, i) =>
    [
      { topic: '/imu', schema: 'sensor_msgs/msg/Imu', value: { angular_velocity: { x: value, y: 0, z: 0 } } },
      { topic: '/mode', schema: 'std_msgs/msg/String', value: { data: states[i] } },
    ].map(({ topic, schema, value }) => ({
      topic,
      schema,
      encoding: 'json',
      schemaEncoding: 'jsonschema',
      schemaData: new TextEncoder().encode('{}'),
      logTime: BigInt(start + i) * 1_000_000_000n,
      data: new TextEncoder().encode(JSON.stringify(value)),
    })),
  );
  const fileBytes = await writeMcap(messages, { chunked: true, compression: 'zstd' });
  const data = await readMcap([{ name: `${id}.mcap`, bytes: fileBytes }]);
  const episode = data.episodes[0];
  const fixture = comparisonFixture({ id, times: [0, 1, 2], values: [1, 2, 3] });
  const recording = decodeRecording(fixture.bytes)!;

  recording.t = Float32Array.from(episode.t);
  recording.frames = episode.t.length;
  recording.topics = episode.topics!;
  recording.inputs = [];
  fixture.stored.frames = recording.frames;
  fixture.stored.origin = { kind: 'file', name: `${id}.mcap`, hash: sha256(fileBytes) };

  return { source: await prepareSource({ stored: fixture.stored, bytes: encodeRecording(recording) }), fileBytes };
}

describe('independent imported MCAP comparison', () => {
  it('aligns selected recorded states, seeks backward and preserves exact file identities and known units', async () => {
    const a = await imported({ id: 'before', start: 100, values: [0.1, 0.2, 0.4], states: ['idle', 'trigger', 'run'] });
    const b = await imported({
      id: 'after',
      start: 1000,
      values: [0.8, 0.9, 1.5],
      states: ['idle', 'idle', 'trigger'],
    });
    const hashes = [sha256(a.fileBytes), sha256(b.fileBytes)];
    const aEvent = a.source.events.find((event) => event.name.endsWith(': trigger'))!;
    const bEvent = b.source.events.find((event) => event.name.endsWith(': trigger'))!;
    const aOffset = alignmentOffset(a.source, aEvent, 0);
    const bOffset = alignmentOffset(b.source, bEvent, 0);
    const signal = 'topic./imu.angular_velocity.x';
    const rule = { kind: 'previous' as const, maxAge: 0.1 };

    expect([aOffset, bOffset]).toEqual([-1, -2]);
    expect(a.source.channels.find((channel) => channel.id === signal)?.unit).toBe('rad/s');
    expect(sampleAt(a.source, signal, sourceTime(a.source, 0, aOffset), rule).value).toBeCloseTo(0.2);
    expect(sampleAt(b.source, signal, sourceTime(b.source, 0, bOffset), rule).value).toBe(1.5);
    expect(sampleAt(a.source, 'topic./mode.data', 1, rule).value).toBe('trigger');
    expect(sampleAt(b.source, 'topic./mode.data', 1, rule).value).toBe('idle');
    expect(sampleAt(a.source, signal, sourceTime(a.source, -1, aOffset), rule).value).toBeCloseTo(0.1);
    expect(sampleAt(b.source, signal, sourceTime(b.source, -1, bOffset), rule).value).toBeCloseTo(0.9);
    expect(
      differenceAt(
        [
          { source: a.source, offset: aOffset },
          { source: b.source, offset: bOffset },
        ],
        -1,
        {
          left: signal,
          right: signal,
          leftUnit: 'rad/s',
          rightUnit: 'rad/s',
          rule,
        },
      ),
    ).toBeCloseTo(-0.8);
    expect([a.source.stored.origin, b.source.stored.origin]).toEqual([
      { kind: 'file', name: 'before.mcap', hash: hashes[0] },
      { kind: 'file', name: 'after.mcap', hash: hashes[1] },
    ]);
    expect([sha256(a.fileBytes), sha256(b.fileBytes)]).toEqual(hashes);
  });
});
