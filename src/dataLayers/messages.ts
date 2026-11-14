export interface RosVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RosQuaternion extends RosVector3 {
  w: number;
}

export interface RosPose {
  position: RosVector3;
  orientation: RosQuaternion;
}

export interface RosColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RosHeader {
  frame_id: string;
}

export interface LaserScan {
  header: RosHeader;
  angle_min: number;
  angle_max: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  ranges: ArrayLike<number>;
  intensities?: ArrayLike<number>;
}

export interface PointField {
  name: string;
  offset: number;
  datatype: number;
  count: number;
}

export interface PointCloud2 {
  header: RosHeader;
  height: number;
  width: number;
  fields: PointField[];
  is_bigendian: boolean;
  point_step: number;
  row_step: number;
  data: Uint8Array;
}

export const MARKER = {
  arrow: 0,
  cube: 1,
  sphere: 2,
  cylinder: 3,
  lineStrip: 4,
  lineList: 5,
  cubeList: 6,
  sphereList: 7,
  points: 8,
} as const;

export const MARKER_DELETE = 2;
export const MARKER_DELETE_ALL = 3;

export interface Marker {
  header: RosHeader;
  ns: string;
  id: number;
  type: number;
  action: number;
  pose: RosPose;
  scale: RosVector3;
  color: RosColor;
  points?: RosVector3[];
  colors?: RosColor[];
}

export interface MarkerArray {
  markers: Marker[];
}

export interface OccupancyGrid {
  header: RosHeader;
  info: { resolution: number; width: number; height: number; origin: RosPose };
  data: ArrayLike<number>;
}

export interface PoseStamped {
  header: RosHeader;
  pose: RosPose;
}

export interface RosPath {
  header: RosHeader;
  poses: PoseStamped[];
}

export interface Odometry {
  header: RosHeader;
  child_frame_id: string;
  pose: { pose: RosPose };
}

export interface TransformStamped {
  header: RosHeader;
  child_frame_id: string;
  transform: { translation: RosVector3; rotation: RosQuaternion };
}

export interface TFMessage {
  transforms: TransformStamped[];
}

export interface FoxglovePose {
  position: RosVector3;
  orientation: RosQuaternion;
}

export interface FoxglovePrimitive {
  pose: FoxglovePose;
  size?: RosVector3;
  color: RosColor;
}

export interface FoxgloveLine {
  type: number;
  pose: FoxglovePose;
  points: RosVector3[];
  color: RosColor;
}

export interface SceneEntity {
  frame_id: string;
  id: string;
  cubes?: FoxglovePrimitive[];
  spheres?: FoxglovePrimitive[];
  cylinders?: FoxglovePrimitive[];
  arrows?: Array<FoxglovePrimitive & { shaft_length?: number }>;
  lines?: FoxgloveLine[];
}

export interface SceneUpdate {
  entities: SceneEntity[];
}

export type DataMessage =
  | { schema: 'sensor_msgs/LaserScan'; message: LaserScan }
  | { schema: 'sensor_msgs/PointCloud2'; message: PointCloud2 }
  | { schema: 'visualization_msgs/Marker'; message: Marker }
  | { schema: 'visualization_msgs/MarkerArray'; message: MarkerArray }
  | { schema: 'foxglove.SceneUpdate'; message: SceneUpdate }
  | { schema: 'nav_msgs/OccupancyGrid'; message: OccupancyGrid }
  | { schema: 'nav_msgs/Path'; message: RosPath }
  | { schema: 'nav_msgs/Odometry'; message: Odometry }
  | { schema: 'geometry_msgs/PoseStamped'; message: PoseStamped }
  | { schema: 'tf2_msgs/TFMessage'; message: TFMessage }
  | { schema: 'scene/Points'; message: ScenePoints };

export interface ScenePoints {
  points: Float32Array;
}

export type DataSchema = DataMessage['schema'];
