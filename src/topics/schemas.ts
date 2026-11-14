import type { DataSchema } from '../dataLayers/messages';

export const schemaKey = (name: string) => name.replace('/msg/', '/');

export const LOG_SCHEMAS = new Set(['rcl_interfaces/Log', 'rosgraph_msgs/Log', 'foxglove.Log']);
export const DIAGNOSTIC_SCHEMAS = new Set(['diagnostic_msgs/DiagnosticArray']);
export const IMU_SCHEMAS = new Set(['sensor_msgs/Imu']);
export const ODOMETRY_SCHEMAS = new Set(['nav_msgs/Odometry']);
export const LOCATION_SCHEMAS = new Set(['sensor_msgs/NavSatFix', 'foxglove.LocationFix']);
export const IMAGE_SCHEMAS = new Set(['sensor_msgs/Image', 'sensor_msgs/CompressedImage']);
export const STATE_SCHEMAS = new Set(['std_msgs/String']);
export const JOINT_SCHEMAS = new Set(['sensor_msgs/JointState']);

export const DATA_LAYER_SCHEMAS: ReadonlyMap<string, DataSchema> = new Map<string, DataSchema>([
  ['sensor_msgs/LaserScan', 'sensor_msgs/LaserScan'],
  ['sensor_msgs/PointCloud2', 'sensor_msgs/PointCloud2'],
  ['visualization_msgs/Marker', 'visualization_msgs/Marker'],
  ['visualization_msgs/MarkerArray', 'visualization_msgs/MarkerArray'],
  ['foxglove.SceneUpdate', 'foxglove.SceneUpdate'],
  ['nav_msgs/OccupancyGrid', 'nav_msgs/OccupancyGrid'],
  ['nav_msgs/Path', 'nav_msgs/Path'],
  ['nav_msgs/Odometry', 'nav_msgs/Odometry'],
  ['geometry_msgs/PoseStamped', 'geometry_msgs/PoseStamped'],
  ['tf2_msgs/TFMessage', 'tf2_msgs/TFMessage'],
]);

export const isSchema = (set: ReadonlySet<string>, schema: string) => set.has(schemaKey(schema));
