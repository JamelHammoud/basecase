import { describe, expect, it } from 'vitest';
import { decoderFor } from './decode';
import { RecordingReader } from './recordingRead';
import { encodeCompressedImage, encodeJointState, MCAP_DAMAGED, MCAP_TOO_MANY_JOINTS } from './ros2Cdr';

const GOLDEN_LITTLE_ENDIAN = [
  [0x00, 0x01, 0x00, 0x00],
  [0x01, 0x00, 0x00, 0x00],
  [0x02, 0x00, 0x00, 0x00],
  [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  [0x01, 0x00, 0x00, 0x00],
  [0x02, 0x00, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00],
  [0x01, 0x00, 0x00, 0x00],
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f],
  [0x00, 0x00, 0x00, 0x00],
  [0x00, 0x00, 0x00, 0x00],
].flat();

const decoderOf = (name: string) => decoderFor('cdr', { name, encoding: 'ros2msg', data: new Uint8Array() })!;

const jointState = decoderOf('sensor_msgs/msg/JointState');

function readJoints(bytes: Uint8Array) {
  const reader = new RecordingReader();

  reader.message(reader.channel('/joint_states', 'sensor_msgs/msg/JointState', jointState), {
    path: 'run.mcap',
    logTime: 1n,
    data: bytes,
  });

  return reader.finish();
}

describe('ROS 2 CDR', () => {
  it('lays out a JointState the way ROS 2 does, aligned after the encapsulation header', () => {
    const bytes = encodeJointState({ stamp: 1.000000002, name: ['a'], position: [1.5] });

    expect([...bytes]).toEqual(GOLDEN_LITTLE_ENDIAN);
    expect(jointState(Uint8Array.from(GOLDEN_LITTLE_ENDIAN))).toMatchObject({
      header: { stamp: { sec: 1, nanosec: 2 } },
      name: ['a'],
      position: Float64Array.of(1.5),
    });
  });

  it('round-trips names, positions, velocities and efforts in both byte orders', () => {
    const message = {
      stamp: 1731571200.25,
      name: ['joint1', 'joint2', 'joint3'],
      position: [0.1, -0.2, 0.3],
      velocity: [1, 2, 3],
      effort: [-4, 5, -6],
      frameId: 'base',
    };

    for (const bigEndian of [false, true]) {
      const decoded = jointState(encodeJointState({ ...message, bigEndian }));

      expect(decoded).toMatchObject({ header: { stamp: { sec: 1731571200, nanosec: 250_000_000 }, frame_id: 'base' } });
      expect(decoded.name).toEqual(message.name);
      expect([...(decoded.position as Float64Array)]).toEqual(message.position);
      expect([...(decoded.velocity as Float64Array)]).toEqual(message.velocity);
      expect([...(decoded.effort as Float64Array)]).toEqual(message.effort);
    }
  });

  it('reads a CompressedImage with its pixels as bytes', () => {
    const bytes = encodeCompressedImage({ stamp: 12.5, format: 'jpeg', data: new Uint8Array(1000).fill(7) });
    const decoded = decoderOf('sensor_msgs/msg/CompressedImage')(bytes);

    expect(decoded).toMatchObject({ header: { stamp: { sec: 12, nanosec: 500_000_000 } }, format: 'jpeg' });
    expect(decoded.data as Uint8Array).toHaveLength(1000);
  });

  it('refuses a truncated message at every cut', () => {
    const bytes = encodeJointState({ stamp: 3, name: ['joint1', 'joint2'], position: [1, 2], velocity: [0, 0] });

    for (let cut = 0; cut < bytes.length; cut++) expect(() => jointState(bytes.subarray(0, cut))).toThrow(MCAP_DAMAGED);
  });

  it('refuses more joints than the cap, positions that don’t match the names and unknown encapsulations', () => {
    const names = Array.from({ length: 65 }, (_, i) => `j${i}`);
    const mismatched = encodeJointState({ stamp: 0, name: ['a', 'b'], position: [1] });
    const xcdr2 = encodeJointState({ stamp: 0, name: ['a'], position: [1] });

    xcdr2[1] = 0x07;

    expect(() => readJoints(encodeJointState({ stamp: 0, name: names, position: names.map(() => 0) }))).toThrow(
      MCAP_TOO_MANY_JOINTS,
    );
    expect(() => readJoints(mismatched)).toThrow(MCAP_DAMAGED);
    expect(() => jointState(xcdr2)).toThrow(MCAP_DAMAGED);
  });
});
