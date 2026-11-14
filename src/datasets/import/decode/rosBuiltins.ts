import { normalizeTypeName, type RosDialect } from './rosDefinition';

export type RosSection = [name: string, fields: string[]];

const SEPARATOR = '='.repeat(80);

export const definitionText = (main: string[], dependencies: RosSection[]) =>
  [main.join('\n'), ...dependencies.map(([name, fields]) => [SEPARATOR, `MSG: ${name}`, ...fields].join('\n'))].join(
    '\n',
  );

export const ROS2_TIME: RosSection = ['builtin_interfaces/Time', ['int32 sec', 'uint32 nanosec']];
export const ROS2_HEADER: RosSection = ['std_msgs/Header', ['builtin_interfaces/Time stamp', 'string frame_id']];
export const ROS1_HEADER: RosSection = ['std_msgs/Header', ['uint32 seq', 'time stamp', 'string frame_id']];

export const JOINT_STATE_FIELDS = [
  'Header header',
  'string[] name',
  'float64[] position',
  'float64[] velocity',
  'float64[] effort',
];
export const IMAGE_FIELDS = [
  'Header header',
  'uint32 height',
  'uint32 width',
  'string encoding',
  'uint8 is_bigendian',
  'uint32 step',
  'uint8[] data',
];
export const COMPRESSED_IMAGE_FIELDS = ['Header header', 'string format', 'uint8[] data'];

const tableFor = (headers: RosSection[]) =>
  new Map([
    ['sensor_msgs/JointState', definitionText(JOINT_STATE_FIELDS, headers)],
    ['sensor_msgs/Image', definitionText(IMAGE_FIELDS, headers)],
    ['sensor_msgs/CompressedImage', definitionText(COMPRESSED_IMAGE_FIELDS, headers)],
  ]);

const BUILTINS: Record<RosDialect, Map<string, string>> = {
  cdr: tableFor([ROS2_HEADER, ROS2_TIME]),
  ros1: tableFor([ROS1_HEADER]),
};

export const builtinDefinition = (dialect: RosDialect, name: string) =>
  BUILTINS[dialect].get(normalizeTypeName(name)) ?? null;
