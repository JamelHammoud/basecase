import { describe, expect, it } from 'vitest';
import {
  decodeImageStamp,
  decodeJointState,
  encodeCompressedImage,
  encodeJointState,
  MCAP_DAMAGED,
  MCAP_TOO_MANY_JOINTS,
} from './ros2Cdr';

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

describe('ROS 2 CDR', () => {
  it('lays out a JointState the way ROS 2 does, aligned after the encapsulation header', () => {
    const bytes = encodeJointState({ stamp: 1.000000002, name: ['a'], position: [1.5] });

    expect([...bytes]).toEqual(GOLDEN_LITTLE_ENDIAN);
    expect(decodeJointState(Uint8Array.from(GOLDEN_LITTLE_ENDIAN))).toMatchObject({
      stampNs: 1_000_000_002n,
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
      const decoded = decodeJointState(encodeJointState({ ...message, bigEndian }));

      expect(decoded.stampNs).toBe(1_731_571_200_250_000_000n);
      expect(decoded.stamp).toBeCloseTo(message.stamp, 6);
      expect(decoded.name).toEqual(message.name);
      expect([...decoded.position]).toEqual(message.position);
      expect([...decoded.velocity]).toEqual(message.velocity);
      expect([...decoded.effort]).toEqual(message.effort);
    }
  });

  it('reads the header stamp of a CompressedImage without touching its pixels', () => {
    const bytes = encodeCompressedImage({ stamp: 12.5, format: 'jpeg', data: new Uint8Array(1000).fill(7) });

    expect(decodeImageStamp(bytes)).toEqual({ stamp: 12.5, stampNs: 12_500_000_000n });
  });

  it('refuses a truncated message at every cut', () => {
    const bytes = encodeJointState({ stamp: 3, name: ['joint1', 'joint2'], position: [1, 2], velocity: [0, 0] });

    for (let cut = 0; cut < bytes.length; cut++) {
      expect(() => decodeJointState(bytes.subarray(0, cut))).toThrow(MCAP_DAMAGED);
    }
  });

  it('refuses counts over the caps before reading them', () => {
    const names = Array.from({ length: 65 }, (_, i) => `j${i}`);
    const longName = encodeJointState({ stamp: 0, name: ['x'.repeat(257)], position: [0] });
    const hugeCount = encodeJointState({ stamp: 0, name: [], position: [] });

    new DataView(hugeCount.buffer).setUint32(20, 0xffffffff, true);

    expect(() => decodeJointState(encodeJointState({ stamp: 0, name: names, position: [] }))).toThrow(
      MCAP_TOO_MANY_JOINTS,
    );
    expect(() => decodeJointState(longName)).toThrow(MCAP_DAMAGED);
    expect(() => decodeJointState(hugeCount)).toThrow(MCAP_TOO_MANY_JOINTS);
  });

  it('refuses positions that don’t match the names and unknown encapsulations', () => {
    const mismatched = encodeJointState({ stamp: 0, name: ['a', 'b'], position: [1] });
    const xcdr2 = encodeJointState({ stamp: 0, name: ['a'], position: [1] });

    xcdr2[1] = 0x07;

    expect(() => decodeJointState(mismatched)).toThrow(MCAP_DAMAGED);
    expect(() => decodeJointState(xcdr2)).toThrow(MCAP_DAMAGED);
  });
});
