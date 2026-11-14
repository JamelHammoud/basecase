import {
  encodeCdr,
  ROS2_COMPRESSED_IMAGE,
  ROS2_DIAGNOSTIC_ARRAY,
  ROS2_IMU,
  ROS2_LASER_SCAN,
  ROS2_LOG,
  ROS2_ODOMETRY,
  ROS2_STRING,
  ROS2_TF_MESSAGE,
  type RosDefinitionFixture,
} from './decode/fixtures';
import type { FixtureMessage } from './mcapFixtures';

export const ROS2_LEVEL = { info: 20, warn: 30, error: 40 } as const;

const text = new TextEncoder();

const ns = (seconds: number) => BigInt(Math.round(seconds * 1e9));

const stampOf = (seconds: number) => {
  const sec = Math.floor(seconds);

  return { sec, nanosec: Math.round((seconds - sec) * 1e9) };
};

const header = (seconds: number, frame: string) => ({ stamp: stampOf(seconds), frame_id: frame });

export function cdrMessage(
  definition: RosDefinitionFixture,
  topic: string,
  [seconds, value]: [number, Record<string, unknown>],
): FixtureMessage {
  return {
    topic,
    schema: definition.name,
    schemaData: text.encode(definition.text),
    logTime: ns(seconds),
    data: encodeCdr(definition.text, definition.name, value),
  };
}

const every = (hz: number, seconds: number) => Array.from({ length: Math.round(hz * seconds) + 1 }, (_, i) => i / hz);

export const imuAt = (start: number, time: number) =>
  cdrMessage(ROS2_IMU, '/imu', [
    start + time,
    {
      header: header(start + time, 'imu_link'),
      orientation: { x: Math.sin(time / 20), y: 0, z: 0, w: Math.cos(time / 20) },
      angular_velocity: { x: 0.1, y: 0, z: Math.sin(time) },
      linear_acceleration: { x: 0, y: 0, z: 9.81 },
    },
  ]);

const odomAt = (start: number, time: number) =>
  cdrMessage(ROS2_ODOMETRY, '/odom', [
    start + time,
    {
      header: header(start + time, 'odom'),
      child_frame_id: 'base_footprint',
      pose: { pose: { position: { x: Math.cos(time / 2), y: Math.sin(time / 2), z: 0 }, orientation: { w: 1 } } },
    },
  ]);

const scanAt = (start: number, time: number) =>
  cdrMessage(ROS2_LASER_SCAN, '/scan', [
    start + time,
    {
      header: header(start + time, 'base_scan'),
      angle_min: 0,
      angle_max: 2 * Math.PI,
      angle_increment: (2 * Math.PI) / 360,
      range_min: 0.12,
      range_max: 3.5,
      ranges: Array.from({ length: 360 }, (_, i) => 1 + 0.5 * Math.sin(i / 30 + time)),
    },
  ]);

const tfAt = (start: number, time: number) =>
  cdrMessage(ROS2_TF_MESSAGE, '/tf', [
    start + time,
    {
      transforms: [
        {
          header: header(start + time, 'odom'),
          child_frame_id: 'base_footprint',
          transform: { translation: { x: Math.cos(time / 2), y: Math.sin(time / 2) }, rotation: { w: 1 } },
        },
      ],
    },
  ]);

const imageAt = (start: number, time: number) =>
  cdrMessage(ROS2_COMPRESSED_IMAGE, '/camera/image_raw/compressed', [
    start + time,
    { header: header(start + time, 'camera'), format: 'jpeg', data: new Uint8Array(64).fill(7) },
  ]);

export const turtlebotMessages = (start: number, seconds: number): FixtureMessage[] => [
  ...every(5, seconds).map((t) => scanAt(start, t)),
  ...every(10, seconds).map((t) => tfAt(start, t)),
  ...every(10, seconds).map((t) => odomAt(start, t)),
  ...every(50, seconds).map((t) => imuAt(start, t)),
  ...every(5, seconds).map((t) => imageAt(start, t)),
];

export const rosoutAt = (seconds: number, level: number, msg: string) =>
  cdrMessage(ROS2_LOG, '/rosout', [seconds, { stamp: stampOf(seconds), level, name: 'base_controller', msg }]);

export const diagnosticsAt = (seconds: number, level: number, message: string) =>
  cdrMessage(ROS2_DIAGNOSTIC_ARRAY, '/diagnostics', [
    seconds,
    {
      header: header(seconds, ''),
      status: [
        { level: 0, name: 'battery', message: 'OK', hardware_id: 'bms' },
        { level, name: 'motor driver', message, hardware_id: 'left_wheel', values: [{ key: 'current', value: '3.2' }] },
      ],
    },
  ]);

export const modeAt = (seconds: number, mode: string) => cdrMessage(ROS2_STRING, '/mode', [seconds, { data: mode }]);
