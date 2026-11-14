import { describe, expect, it } from 'vitest';
import { encodeCompressedImage, encodeJointState } from '../ros2Cdr';
import {
  encodeCdr,
  encodeRos1,
  ROS1_JOINT_STATE,
  ROS1_LOG,
  ROS1_STRING,
  ROS2_COMPRESSED_IMAGE,
  ROS2_DIAGNOSTIC_ARRAY,
  ROS2_IMU,
  ROS2_JOINT_STATE,
  ROS2_LASER_SCAN,
  ROS2_LOG,
  ROS2_ODOMETRY,
  ROS2_POINT_CLOUD2,
  ROS2_STRING,
  ROS2_TF_MESSAGE,
  type FixtureMessage,
  type RosDefinitionFixture,
} from './fixtures';
import { decoderFor, type DecodedMessage } from './index';
import { definitionText, IMAGE_FIELDS, ROS2_HEADER, ROS2_TIME } from './rosBuiltins';

const text = new TextEncoder();
const header = (sec: number, frame: string) => ({ stamp: { sec, nanosec: 250 }, frame_id: frame });
const numbers = (length: number, start = 0) => Float64Array.from({ length }, (_, i) => start + i / 4);
const vector = (x: number, y: number, z: number) => ({ x, y, z });
const quaternion = { x: 0, y: 0, z: 0.6, w: 0.8 };

const decoderOf = (encoding: 'cdr' | 'ros1', fixture: RosDefinitionFixture, data = text.encode(fixture.text)) => {
  const decode = decoderFor(encoding, {
    name: fixture.name,
    encoding: `${encoding === 'cdr' ? 'ros2' : 'ros1'}msg`,
    data,
  });

  if (!decode) throw new Error('No decoder');

  return decode;
};

const ROS2_CASES: [RosDefinitionFixture, FixtureMessage][] = [
  [
    ROS2_IMU,
    {
      header: header(5, 'imu'),
      orientation: quaternion,
      orientation_covariance: numbers(9),
      angular_velocity: vector(1, -2, 3),
      angular_velocity_covariance: numbers(9, 1),
      linear_acceleration: vector(0, 0, 9.81),
      linear_acceleration_covariance: numbers(9, 2),
    },
  ],
  [
    ROS2_ODOMETRY,
    {
      header: header(6, 'odom'),
      child_frame_id: 'base_link',
      pose: { pose: { position: vector(1, 2, 3), orientation: quaternion }, covariance: numbers(36) },
      twist: { twist: { linear: vector(0.5, 0, 0), angular: vector(0, 0, 0.1) }, covariance: numbers(36, 3) },
    },
  ],
  [
    ROS2_LASER_SCAN,
    {
      header: header(7, 'laser'),
      angle_min: -1.5,
      angle_max: 1.5,
      angle_increment: 0.25,
      time_increment: 0.125,
      scan_time: 0.5,
      range_min: 0.0625,
      range_max: 12,
      ranges: Float64Array.from([1, 2.5, 3.75]),
      intensities: Float64Array.from([100, 200, 300]),
    },
  ],
  [
    ROS2_TF_MESSAGE,
    {
      transforms: [
        {
          header: header(8, 'world'),
          child_frame_id: 'arm',
          transform: { translation: vector(1, 0, 0), rotation: quaternion },
        },
        {
          header: header(9, 'arm'),
          child_frame_id: 'hand',
          transform: { translation: vector(0, 1, 0), rotation: quaternion },
        },
      ],
    },
  ],
  [ROS2_COMPRESSED_IMAGE, { header: header(10, 'camera'), format: 'jpeg', data: Uint8Array.from([255, 216, 1, 2]) }],
  [
    ROS2_JOINT_STATE,
    {
      header: header(11, ''),
      name: ['shoulder', 'elbow'],
      position: Float64Array.from([0.5, -0.25]),
      velocity: Float64Array.from([]),
      effort: Float64Array.from([1, 2]),
    },
  ],
  [
    ROS2_LOG,
    {
      stamp: { sec: 12, nanosec: 1 },
      level: 30,
      name: 'motor',
      msg: 'hot',
      file: 'motor.cpp',
      function: 'spin',
      line: 42,
    },
  ],
  [
    ROS2_DIAGNOSTIC_ARRAY,
    {
      header: header(13, ''),
      status: [
        { level: 1, name: 'battery', message: 'low', hardware_id: 'bms', values: [{ key: 'volts', value: '11.1' }] },
        { level: 0, name: 'motor', message: 'ok', hardware_id: 'm1', values: [] },
      ],
    },
  ],
  [ROS2_STRING, { data: 'héllo ✓' }],
  [
    ROS2_POINT_CLOUD2,
    {
      header: header(14, 'lidar'),
      height: 1,
      width: 2,
      fields: [
        { name: 'x', offset: 0, datatype: 7, count: 1 },
        { name: 'y', offset: 4, datatype: 7, count: 1 },
      ],
      is_bigendian: false,
      point_step: 8,
      row_step: 16,
      data: Uint8Array.from({ length: 16 }, (_, i) => i),
      is_dense: true,
    },
  ],
];

describe('ROS 2 CDR decoding', () => {
  describe.each([
    ['little', false],
    ['big', true],
  ])('%s endian', (_, bigEndian) => {
    it.each(ROS2_CASES.map(([fixture, value]) => [fixture.name, fixture, value] as const))(
      'round-trips %s',
      (_name, fixture, value) => {
        const bytes = encodeCdr(fixture.text, fixture.name, value, { bigEndian });

        expect(decoderOf('cdr', fixture)(bytes)).toEqual(value);
      },
    );
  });

  it('aligns each primitive to its size from after the encapsulation header', () => {
    const fixture = { name: 'test_msgs/msg/Pair', text: 'uint8 small\nfloat64 big' };
    const bytes = encodeCdr(fixture.text, fixture.name, { small: 7, big: 1.5 });

    expect(bytes.byteLength).toBe(4 + 8 + 8);
    expect(decoderOf('cdr', fixture)(bytes)).toEqual({ small: 7, big: 1.5 });
  });

  it('reads every primitive kind, bounded sequences and an empty message', () => {
    const fixture = {
      name: 'test_msgs/msg/Mixed',
      text: [
        'int64 big',
        'uint64 huge',
        'int8 tiny',
        'int16 short',
        'byte raw',
        'char letter',
        'bool[] flags',
        'int32[3] triple',
        'float32[<=4] bounded',
        'string<=8 label',
        'wstring wide',
        'Empty nothing',
        '================================================================================',
        'MSG: test_msgs/msg/Empty',
      ].join('\n'),
    };
    const value = {
      big: -9_007_199_254_740_991,
      huge: 2 ** 60,
      tiny: -5,
      short: -300,
      raw: 200,
      letter: 65,
      flags: Float64Array.from([1, 0, 1]),
      triple: Float64Array.from([-1, 0, 1]),
      bounded: Float64Array.from([0.5]),
      label: 'arm',
      wide: 'wide 𝄞',
      nothing: {},
    };

    expect(decoderOf('cdr', fixture)(encodeCdr(fixture.text, fixture.name, value))).toEqual(value);
  });

  it('decodes JointState and CompressedImage from the built-in table when the schema is empty', () => {
    const empty = new Uint8Array();
    const joints = decoderOf('cdr', { name: 'sensor_msgs/msg/JointState', text: '' }, empty);
    const images = decoderOf('cdr', { name: 'sensor_msgs/msg/CompressedImage', text: '' }, empty);
    const jointBytes = encodeJointState({ stamp: 1.5, name: ['a'], position: [2], frameId: 'base', bigEndian: true });

    expect(joints(jointBytes)).toEqual({
      header: { stamp: { sec: 1, nanosec: 500_000_000 }, frame_id: 'base' },
      name: ['a'],
      position: Float64Array.from([2]),
      velocity: new Float64Array(),
      effort: new Float64Array(),
    });
    expect(images(encodeCompressedImage({ stamp: 2, format: 'png', data: Uint8Array.from([9]) }))).toMatchObject({
      format: 'png',
      data: Uint8Array.from([9]),
    });
  });

  it('decodes an Image whose pixels outnumber the item cap', () => {
    const decode = decoderOf('cdr', { name: 'sensor_msgs/msg/Image', text: '' }, new Uint8Array());
    const definition = definitionText(IMAGE_FIELDS, [ROS2_HEADER, ROS2_TIME]);
    const image = {
      header: header(1, 'cam'),
      height: 1080,
      width: 1920,
      encoding: 'rgb8',
      is_bigendian: 0,
      step: 5760,
    };
    const data = new Uint8Array(1280 * 320 * 3).fill(7);
    const head = encodeCdr(definition, 'sensor_msgs/msg/Image', image);
    const bytes = new Uint8Array(head.length + data.length);

    bytes.set(head);
    new DataView(bytes.buffer).setUint32(head.length - 4, data.length, true);
    bytes.set(data, head.length);

    const decoded = decode(bytes);
    const pixels = decoded.data as Uint8Array;

    expect(decoded).toMatchObject(image);
    expect(pixels.byteLength).toBe(data.byteLength);
    expect(pixels.every((value) => value === 7)).toBe(true);
  });

  it('skips a type it has no definition for', () => {
    expect(
      decoderFor('cdr', { name: 'custom_msgs/msg/Thing', encoding: 'ros2msg', data: new Uint8Array() }),
    ).toBeNull();
    expect(decoderFor('ros1', { name: 'custom_msgs/Thing', encoding: 'ros1msg', data: new Uint8Array() })).toBeNull();
  });
});

describe('ROS 1 decoding', () => {
  const stamped = (sec: number, frame: string) => ({ seq: 3, stamp: { sec, nsec: 9 }, frame_id: frame });

  it.each<[RosDefinitionFixture, FixtureMessage]>([
    [
      ROS1_JOINT_STATE,
      {
        header: stamped(4, 'base'),
        name: ['hip'],
        position: Float64Array.from([0.1]),
        velocity: Float64Array.from([0.2]),
        effort: new Float64Array(),
      },
    ],
    [
      ROS1_LOG,
      {
        header: stamped(5, ''),
        level: 8,
        name: '/driver',
        msg: 'stalled',
        file: 'driver.py',
        function: 'step',
        line: 7,
        topics: ['/joint_states', '/rosout'],
      },
    ],
    [ROS1_STRING, { data: 'ros one' }],
  ])('round-trips %s', (fixture, value) => {
    expect(decoderOf('ros1', fixture)(encodeRos1(fixture.text, fixture.name, value))).toEqual(value);
  });

  it('packs without alignment, strings without a terminator, byte as int8 and duration as two ints', () => {
    const fixture = {
      name: 'test_msgs/Packed',
      text: 'uint8 small\nfloat64 big\nstring tag\nbyte signed\nduration wait',
    };
    const value = { small: 1, big: 2, tag: 'ab', signed: -3, wait: { sec: -1, nsec: 5 } };
    const bytes = encodeRos1(fixture.text, fixture.name, value);

    expect(bytes.byteLength).toBe(1 + 8 + 4 + 2 + 1 + 8);
    expect(decoderOf('ros1', fixture)(bytes)).toEqual(value);
  });

  it('decodes JointState from the built-in table when the schema is empty', () => {
    const decode = decoderOf('ros1', { name: 'sensor_msgs/JointState', text: '' }, new Uint8Array());
    const value = {
      header: stamped(1, ''),
      name: ['a'],
      position: Float64Array.from([1]),
      velocity: new Float64Array(),
      effort: new Float64Array(),
    };

    expect(decode(encodeRos1(ROS1_JOINT_STATE.text, ROS1_JOINT_STATE.name, value))).toEqual(value);
  });
});

describe('non-finite numbers', () => {
  it('keeps NaN and infinities as they are, without throwing', () => {
    const fixture = { name: 'test_msgs/msg/Floats', text: 'float64 a\nfloat32 b\nfloat64[] c' };
    const value = { a: Number.NaN, b: -Infinity, c: Float64Array.from([Infinity, Number.NaN]) };
    const decoded: DecodedMessage = decoderOf('cdr', fixture)(encodeCdr(fixture.text, fixture.name, value));
    const ros1 = decoderOf('ros1', fixture)(encodeRos1(fixture.text, fixture.name, value));

    expect(decoded).toEqual(value);
    expect(ros1).toEqual(value);
  });
});
