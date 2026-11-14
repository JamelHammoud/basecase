import { TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

interface Columns {
  numbers?: Record<string, number[]>;
  labels?: Record<string, string[]>;
  lists?: Record<string, number[][]>;
}

function ragged(rows: number[][]) {
  const at = new Uint32Array(rows.length + 1);

  rows.forEach((row, i) => (at[i + 1] = at[i] + row.length));

  return { at, v: Float64Array.from(rows.flat()) };
}

export const recordedTopic = (topic: string, schema: string, t: number[], columns: Columns = {}): RecordedTopic => ({
  topic,
  schema,
  t: Float64Array.from(t),
  numbers: new Map(Object.entries(columns.numbers ?? {}).map(([path, v]) => [path, Float64Array.from(v)])),
  labels: new Map(Object.entries(columns.labels ?? {})),
  lists: new Map(Object.entries(columns.lists ?? {}).map(([path, rows]) => [path, ragged(rows)])),
  blobs: new Map(),
  clipped: false,
});

export const ROSOUT = recordedTopic('/rosout', 'rcl_interfaces/msg/Log', [0.1, 0.6, 1.2], {
  numbers: { level: [20, 30, 40] },
  labels: { name: ['planner', 'planner', 'driver'], msg: ['ready', 'slow loop', 'motor fault'] },
});

export const DIAGNOSTICS = recordedTopic('/diagnostics', 'diagnostic_msgs/msg/DiagnosticArray', [0.5, 1.5], {
  numbers: { 'status[0].level': [0, 2], 'status[1].level': [1, 3] },
  labels: {
    'status[0].name': ['motor', 'motor'],
    'status[0].message': ['ok', 'overheat'],
    'status[1].name': ['camera', 'camera'],
    'status[1].message': ['dropped frames', 'no data'],
  },
});

export const MODE = recordedTopic('/mode', 'std_msgs/msg/String', [0, 0.8, 1.6], {
  labels: { data: ['idle', 'walk', 'idle'] },
});

export const IMU = recordedTopic('/imu', 'sensor_msgs/msg/Imu', [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75], {
  numbers: {
    'angular_velocity.x': [0, 1, 2, 3, 4, 5, 6, 7],
    'angular_velocity.y': [0, -1, -2, -3, -4, -5, -6, -7],
    'angular_velocity.z': [0, 0, 0, 0, 0, 0, 0, 0],
  },
});

export const ODOMETRY = recordedTopic('/odom', 'nav_msgs/msg/Odometry', [0, 1, 2], {
  numbers: { 'pose.pose.position.x': [0, 1, 2], 'pose.pose.position.y': [0, 0.5, 2] },
});

export const CAMERA = recordedTopic('/camera/image_raw', 'sensor_msgs/msg/Image', [0, 1], {
  numbers: { width: [640, 640] },
});

export const JOINTS = recordedTopic('/joint_states', 'sensor_msgs/msg/JointState', [0, 1], {
  labels: { 'name[0]': ['hip', 'hip'], 'header.frame_id': ['base', 'base'] },
  lists: {
    effort: [
      [1, 2],
      [3, 4],
    ],
  },
});

export const topicIndex = (...topics: RecordedTopic[]) => new TopicIndex({ topics });
