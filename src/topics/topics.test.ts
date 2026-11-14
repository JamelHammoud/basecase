import { describe, expect, it } from 'vitest';
import { TopicCollector } from './collector';
import { diagnosticsAt } from './diagnostics';
import { logEntries } from './logs';
import { heldAt, topicMeaning } from './meaning';
import { messageAt, messageTree } from './messageTree';
import { stateSpans } from './states';
import { decodeTopicLog, encodeTopicLog } from './topicFile';
import { TopicIndex } from './topicIndex';
import { TOPIC_LIMITS, type Decoded } from './topicLog';

const S = 1_000_000_000n;
const at = (seconds: number) => BigInt(Math.round(seconds * 1e9)) + 100n * S;

function collected(add: (c: TopicCollector) => void) {
  const c = new TopicCollector();

  add(c);

  return new TopicIndex(c.finish(c.first ?? 0n));
}

const imu = (i: number): Decoded => ({
  header: { stamp: { sec: 100 + i, nanosec: 0 }, frame_id: 'imu' },
  orientation: { x: Math.sin(0.1 * i), y: 0, z: 0, w: Math.cos(0.1 * i) },
  orientation_covariance: Float64Array.from({ length: 9 }, () => 0),
  angular_velocity: { x: i, y: -i, z: Number.NaN },
});

describe('topic columns', () => {
  it('keeps every field of every message by time, sorted, with gaps for missing values', () => {
    const index = collected((c) => {
      c.add('/imu', 'sensor_msgs/msg/Imu', at(0.02), imu(2));
      c.add('/imu', 'sensor_msgs/msg/Imu', at(0), imu(0));
      c.add('/imu', 'sensor_msgs/msg/Imu', at(0.01), imu(1));
      c.add('/joint_states', 'sensor_msgs/msg/JointState', at(0.005), {
        name: ['a', 'b'],
        effort: Float64Array.of(1, 2),
      });
      c.add('/joint_states', 'sensor_msgs/msg/JointState', at(0.015), {
        name: ['a', 'b', 'c'],
        effort: Float64Array.of(3, 4, 5),
      });
    });

    expect(index.series('topic./imu.angular_velocity.x')).toEqual({ t: [0, 0.01, 0.02], v: [0, 1, 2] });
    expect(index.series('topic./imu.angular_velocity.z').v.every(Number.isNaN)).toBe(true);
    expect(index.series('topic./imu.header.frame_id')).toEqual({ t: [], v: [] });
    expect(index.labels('topic./imu.header.frame_id')?.v).toEqual(['imu', 'imu', 'imu']);
    expect(index.expand('topic./joint_states.effort[:]')).toEqual(
      [0, 1, 2].map((i) => `topic./joint_states.effort[${i}]`),
    );
    expect(index.series('topic./joint_states.effort[2]').v).toEqual([Number.NaN, 5]);
    expect(index.expand('topic./imu.angular_velocity.*')).toHaveLength(3);
    expect(index.valueAt('topic./joint_states.name[1]', 0.01)).toEqual(['b']);
    expect(index.valueAt('topic./joint_states.effort[0]', 0.001)).toBeUndefined();
    expect(index.listed()).toContain('topic./joint_states.effort[:]');
    expect(index.resolve('topic./imu.orientation.w')?.path).toBe('orientation.w');
  });

  it('round-trips through the try file byte for byte, and refuses a damaged one', () => {
    const c = new TopicCollector();

    c.add('/scan', 'sensor_msgs/msg/LaserScan', at(0), {
      ranges: Float64Array.of(1, 2, 3),
      data: new Uint8Array([7, 8]),
    });
    c.add('/mode', 'std_msgs/msg/String', at(1), { data: 'drive ü' });

    const bytes = encodeTopicLog(c.finish(c.first!));
    const again = encodeTopicLog(decodeTopicLog(bytes)!);

    expect(again).toEqual(bytes);
    expect(decodeTopicLog(bytes)!.topics[0].labels.get('data')).toEqual(['drive ü']);
    expect(decodeTopicLog(bytes.subarray(0, bytes.length - 8))).toBeNull();

    const lying = bytes.slice();

    lying[20] ^= 0xff;
    expect(() => decodeTopicLog(lying)).not.toThrow();
  });

  it('caps struct arrays and marks the topic clipped instead of failing', () => {
    const index = collected((c) =>
      c.add('/tf', 'tf2_msgs/msg/TFMessage', at(0), {
        transforms: Array.from({ length: TOPIC_LIMITS.items + 5 }, (_, i) => ({ child_frame_id: `f${i}` })),
      }),
    );

    expect(index.topics[0].clipped).toBe(true);
    expect(index.topics[0].labels.size).toBe(TOPIC_LIMITS.items);
  });
});

describe('what panels read', () => {
  const ROS2 = 'rcl_interfaces/msg/Log';

  it('lists logs up to the playhead, filtered by level and words', () => {
    const index = collected((c) => {
      c.add('/rosout', ROS2, at(0), { level: 20, name: 'base', msg: 'ready' });
      c.add('/rosout', ROS2, at(1), { level: 30, name: 'base', msg: 'battery low' });
      c.add('/rosout', ROS2, at(2), { level: 40, name: 'arm', msg: 'motor stalled' });
    });

    expect(logEntries(index).map((e) => e.level)).toEqual(['info', 'warn', 'error']);
    expect(logEntries(index, { until: 1.5, level: 'warn' }).map((e) => e.text)).toEqual(['battery low']);
    expect(logEntries(index, { search: 'ARM stalled' })).toHaveLength(1);
  });

  it('shows the newest level of each diagnostic by name', () => {
    const status = (level: number, message: string) => ({
      header: { stamp: { sec: 0, nanosec: 0 }, frame_id: '' },
      status: [
        { level: 0, name: 'battery', message: 'OK', hardware_id: 'bms', values: [] },
        { level, name: 'motor driver', message, hardware_id: 'drv', values: [{ key: 'temp', value: '80' }] },
      ],
    });
    const index = collected((c) => {
      c.add('/diagnostics', 'diagnostic_msgs/msg/DiagnosticArray', at(0), status(0, 'OK'));
      c.add('/diagnostics', 'diagnostic_msgs/msg/DiagnosticArray', at(1), status(2, 'Overcurrent'));
    });
    const levels = (time: number) => diagnosticsAt(index, { at: time }).map((r) => `${r.name}:${r.level}`);

    expect(levels(0.5)).toEqual(['battery:ok', 'motor driver:ok']);
    expect(levels(1)).toEqual(['battery:ok', 'motor driver:error']);
    expect(diagnosticsAt(index, { at: 1 })[1].message).toBe('Overcurrent');
  });

  it('turns a mode topic into spans', () => {
    expect(stateSpans([0, 1, 2, 3], ['idle', 'idle', 'drive', 'drive'], 5)).toEqual([
      { from: 0, to: 2, value: 'idle' },
      { from: 2, to: 5, value: 'drive' },
    ]);
  });

  it('rebuilds the message at a moment as a tree', () => {
    const index = collected((c) => c.add('/imu', 'sensor_msgs/msg/Imu', at(0), imu(3)));
    const topic = index.topics[0];
    const message = messageAt(topic, 0) as { orientation: { w: number }; header: { frame_id: string } };

    expect(message.header.frame_id).toBe('imu');
    expect(message.orientation.w).toBeCloseTo(Math.cos(0.3));
    expect(messageTree(topic, 0).map((n) => n.key)).toEqual([
      'angular_velocity',
      'header',
      'orientation',
      'orientation_covariance',
    ]);
  });

  it('maps an IMU to tilt and odometry to the map’s x and z', () => {
    const index = collected((c) => {
      c.add('/imu', 'sensor_msgs/msg/Imu', at(0), imu(0));
      c.add('/imu', 'sensor_msgs/msg/Imu', at(1), imu(5));
      c.add('/odom', 'nav_msgs/msg/Odometry', at(0), { pose: { pose: { position: { x: 1, y: 2, z: 0 } } } });
    });
    const meaning = topicMeaning(index);

    expect(heldAt(meaning.tilt!, [0, 1.5])[0]).toBeCloseTo(0);
    expect(heldAt(meaning.tilt!, [1.5])[0]).toBeCloseTo(2 * 0.5 * (180 / Math.PI));
    expect(heldAt(meaning.x!, [0])).toEqual([1000]);
    expect(heldAt(meaning.z!, [0])).toEqual([-2000]);
  });
});
