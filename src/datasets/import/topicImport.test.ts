import { McapRecordBuilder } from '@mcap/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSOLE } from '../../cases/console/layout';
import { diagnosticsAt as diagnosticRows } from '../../topics/diagnostics';
import { logEntries } from '../../topics/logs';
import { recordingTopics } from '../../topics/recordingTopics';
import { stateSpans } from '../../topics/states';
import { recordingConsole } from '../../topics/topicConsole';
import { encodeProtobuf, encodeRos1, protobufSchema, ROS1_JOINT_STATE } from './decode/fixtures';
import { SCHEMA_REFUSED } from './decode/limits';
import { writeMcap, type FixtureMessage } from './mcapFixtures';
import { readMcap } from './recordingFiles';
import { readSource } from './readSource';
import { MCAP_DAMAGED } from './ros2Cdr';
import { writeBag1 } from './rosbag1Fixtures';
import { diagnosticsAt, imuAt, modeAt, ROS2_LEVEL, rosoutAt, turtlebotMessages } from './topicFixtures';

const START = 1_700_000_000;
const text = new TextEncoder();

const opened = async (name: string, bytes: Uint8Array) => {
  const data = await readMcap([{ name, bytes }]);

  return { data, index: recordingTopics(data.episodes[0])! };
};

const mcap = (messages: FixtureMessage[]) => writeMcap(messages, { chunked: true, compression: 'zstd' });

describe('opening any ROS recording with every topic as signals', () => {
  it('lists every topic of a TurtleBot-style ROS 2 MCAP as signals', async () => {
    const { data, index } = await opened('turtlebot.mcap', await mcap(turtlebotMessages(START, 4)));
    const topics = index.topics.map((t) => t.topic);

    expect(topics).toEqual(['/camera/image_raw/compressed', '/imu', '/odom', '/scan', '/tf']);
    expect(data.names).toEqual([]);
    expect(data.episodes[0].videos).toEqual([expect.objectContaining({ camera: '/camera/image_raw/compressed' })]);
    expect(index.series('topic./imu.angular_velocity.z').t).toHaveLength(201);
    expect(index.expand('topic./scan.ranges[:]')).toHaveLength(360);
    expect(index.valueAt('topic./tf.transforms[0].child_frame_id', 1)).toEqual(['base_footprint']);
    expect(index.listed()).toEqual(
      expect.arrayContaining([
        'topic./odom.pose.pose.position.x',
        'topic./scan.ranges[:]',
        'topic./imu.header.frame_id',
      ]),
    );
    expect(index.topic('topic./camera/image_raw/compressed')?.blobs.get('data')?.bytes.length).toBe(21 * 64);
  });

  it('plots each joint’s effort from a ROS 1 bag of an arm', async () => {
    const def = ROS1_JOINT_STATE;
    const names = ['shoulder', 'elbow', 'wrist'];
    const messages = Array.from({ length: 50 }, (_, i) => ({
      topic: '/joint_states',
      type: def.name,
      definition: def.text,
      ns: BigInt(START) * 1_000_000_000n + BigInt(i) * 20_000_000n,
      data: encodeRos1(def.text, def.name, {
        header: { stamp: { sec: START, nsec: i * 20_000_000 } },
        name: names,
        position: names.map((_, j) => 0.1 * i * (j + 1)),
        effort: names.map((_, j) => j + i / 10),
      }),
    }));
    const { data, index } = await opened('arm.bag', writeBag1(messages, { chunked: true, compression: 'lz4' }));
    const efforts = index.expand('topic./joint_states.effort[:]');

    expect(data.names).toEqual(names);
    expect(efforts).toEqual([0, 1, 2].map((j) => `topic./joint_states.effort[${j}]`));
    expect(index.series(efforts[2]).v.slice(0, 3)).toEqual([2, 2.1, 2.2]);
    expect(data.episodes[0].state[49 * 3 + 2]).toBeCloseTo(0.1 * 49 * 3, 9);
  });

  it('plots a Protobuf foxglove.PoseInFrame channel’s position', async () => {
    const pose = (i: number): FixtureMessage => ({
      topic: '/pose',
      schema: 'foxglove.PoseInFrame',
      schemaEncoding: 'protobuf',
      schemaData: protobufSchema(),
      encoding: 'protobuf',
      logTime: BigInt(START + i) * 1_000_000_000n,
      data: encodeProtobuf('foxglove.PoseInFrame', {
        timestamp: { seconds: START + i },
        frame_id: 'map',
        pose: { position: { x: i, y: 2 * i, z: 0 }, orientation: { w: 1 } },
      }),
    });
    const { index } = await opened('pose.mcap', await mcap([0, 1, 2].map(pose)));

    expect(index.series('topic./pose.pose.position.y')).toEqual({ t: [0, 1, 2], v: [0, 2, 4] });
    expect(index.valueAt('topic./pose.frame_id', 2)).toEqual(['map']);
  });

  it('plots a JSON channel’s nested field', async () => {
    const reading = (i: number): FixtureMessage => ({
      topic: 'rover/telemetry',
      schema: 'telemetry',
      schemaEncoding: 'jsonschema',
      schemaData: text.encode('{"type":"object"}'),
      encoding: 'json',
      logTime: BigInt(START) * 1_000_000_000n + BigInt(i) * 100_000_000n,
      data: text.encode(JSON.stringify({ battery: { cells: [3.7, 3.6], pack: { volts: 12 - i / 10 } }, mode: 'auto' })),
    });
    const { index } = await opened('rover.mcap', await mcap([0, 1, 2, 3].map(reading)));

    expect(index.series('topic.rover/telemetry.battery.pack.volts').v).toEqual([12, 11.9, 11.8, 11.7]);
    expect(index.expand('topic.rover/telemetry.battery.cells[:]')).toHaveLength(2);
  });
});

describe('what panels read from a recording', () => {
  it('fills the log from /rosout and filters it to warnings', async () => {
    const messages = [
      rosoutAt(START, ROS2_LEVEL.info, 'Navigation ready'),
      rosoutAt(START + 1, ROS2_LEVEL.warn, 'Battery at 15%'),
      rosoutAt(START + 2, ROS2_LEVEL.error, 'Left wheel stalled'),
    ];
    const { index } = await opened('log.mcap', await mcap(messages));

    expect(logEntries(index).map((e) => e.level)).toEqual(['info', 'warn', 'error']);
    expect(logEntries(index, { level: 'warn', until: 1.5 }).map((e) => [e.at, e.text])).toEqual([
      [1, 'Battery at 15%'],
    ]);
  });

  it('shows a motor driver turning to error in its diagnostics', async () => {
    const messages = [
      diagnosticsAt(START, 0, 'OK'),
      diagnosticsAt(START + 1, 1, 'Hot'),
      diagnosticsAt(START + 2, 2, 'Overcurrent'),
    ];
    const { index } = await opened('diag.mcap', await mcap(messages));
    const driver = (at: number) => diagnosticRows(index, { at }).find((r) => r.name === 'motor driver');

    expect([0, 1, 2].map((at) => driver(at)?.level)).toEqual(['ok', 'warn', 'error']);
    expect(driver(2)?.message).toBe('Overcurrent');
  });

  it('shows a /mode string topic as states, and odometry x against y as the path', async () => {
    const modes = ['idle', 'idle', 'explore', 'explore', 'dock'].map((mode, i) => modeAt(START + i, mode));
    const { index } = await opened('run.mcap', await mcap([...modes, ...turtlebotMessages(START, 4)]));
    const panels = recordingConsole(DEFAULT_CONSOLE, index).panels;
    const states = panels.find((p) => p.kind === 'states');
    const odometry = panels.find((p) => p.kind === 'plot' && 'x' in p && p.x);
    const labels = index.labels(states && 'signal' in states ? states.signal : '')!;

    expect(stateSpans(labels.t, labels.v, 4).map((s) => [s.value, s.from, s.to])).toEqual([
      ['idle', 0, 2],
      ['explore', 2, 4],
      ['dock', 4, 4],
    ]);
    expect(odometry).toMatchObject({
      x: 'topic./odom.pose.pose.position.x',
      signals: ['topic./odom.pose.pose.position.y'],
    });

    const x = index.series('topic./odom.pose.pose.position.x').v;
    const y = index.series('topic./odom.pose.pose.position.y').v;

    expect(x.every((v, i) => Math.abs(Math.hypot(v, y[i]) - 1) < 1e-9)).toBe(true);
  });
});

describe('one timeline, the same every time', () => {
  it('plays two MCAP files picked together on one timeline', async () => {
    const first = await mcap(turtlebotMessages(START, 2));
    const second = await mcap([rosoutAt(START + 5, ROS2_LEVEL.warn, 'Lost localization'), imuAt(START, 5)]);
    const source = await readSource({ kind: 'bytes', name: 'run', files: { 'b.mcap': second, 'a.mcap': first } });
    const [episode] = source!.data.episodes;
    const index = recordingTopics(episode)!;

    expect(source!.data.episodes).toHaveLength(1);
    expect(episode.t.at(-1)).toBe(5);
    expect(logEntries(index).map((e) => e.at)).toEqual([5]);
    expect(index.series('topic./imu.angular_velocity.z').t.at(-1)).toBe(5);
  });

  it('gives the same signals for the same file', async () => {
    const bytes = await mcap([...turtlebotMessages(START, 1), rosoutAt(START, ROS2_LEVEL.info, 'up')]);
    const [a, b] = await Promise.all([readMcap([{ name: 'x.mcap', bytes }]), readMcap([{ name: 'x.mcap', bytes }])]);

    expect(a.episodes[0].topics).toEqual(b.episodes[0].topics);
  });
});

describe('recordings that try to break the reader', () => {
  it('refuses a schema that recurses forever', async () => {
    const loop =
      'pkg/A a\n================================================================================\nMSG: pkg/A\npkg/B b\n================================================================================\nMSG: pkg/B\npkg/A[] back';
    const message: FixtureMessage = {
      topic: '/loop',
      schema: 'pkg/msg/Loop',
      schemaData: text.encode(loop),
      logTime: 1n,
      data: new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]),
    };

    await expect(readMcap([{ name: 'loop.mcap', bytes: await writeMcap([message]) }])).rejects.toThrow(SCHEMA_REFUSED);
  });

  it('refuses a message record that declares 2 GB without allocating it', async () => {
    const builder = new McapRecordBuilder();

    builder.writeMagic();
    builder.writeHeader({ profile: 'ros2', library: 'basecase-test' });

    const head = builder.buffer.slice();
    const record = new Uint8Array(9 + 64);
    const view = new DataView(record.buffer);

    record[0] = 0x05;
    view.setBigUint64(1, 2n ** 31n, true);

    const bytes = new Uint8Array(head.length + record.length);

    bytes.set(head);
    bytes.set(record, head.length);

    await expect(readMcap([{ name: 'huge.mcap', bytes }])).rejects.toThrow(MCAP_DAMAGED);
  });
});
