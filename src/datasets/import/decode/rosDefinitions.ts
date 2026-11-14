import {
  COMPRESSED_IMAGE_FIELDS,
  definitionText,
  JOINT_STATE_FIELDS,
  ROS1_HEADER,
  ROS2_HEADER,
  ROS2_TIME,
  type RosSection,
} from './rosBuiltins';

export interface RosDefinitionFixture {
  name: string;
  text: string;
}

const VECTOR3: RosSection = ['geometry_msgs/Vector3', ['float64 x', 'float64 y', 'float64 z']];
const POINT: RosSection = ['geometry_msgs/Point', ['float64 x', 'float64 y', 'float64 z']];
const QUATERNION: RosSection = [
  'geometry_msgs/Quaternion',
  ['float64 x 0', 'float64 y 0', 'float64 z 0', 'float64 w 1'],
];
const POSE: RosSection = ['geometry_msgs/Pose', ['Point position', 'Quaternion orientation']];
const POSE_COVARIANCE: RosSection = [
  'geometry_msgs/PoseWithCovariance',
  ['# Row-major 6x6 covariance', 'Pose pose', 'float64[36] covariance'],
];
const TWIST: RosSection = ['geometry_msgs/Twist', ['Vector3  linear', 'Vector3  angular']];
const TWIST_COVARIANCE: RosSection = ['geometry_msgs/TwistWithCovariance', ['Twist twist', 'float64[36] covariance']];
const TRANSFORM: RosSection = ['geometry_msgs/Transform', ['Vector3 translation', 'Quaternion rotation']];
const TRANSFORM_STAMPED: RosSection = [
  'geometry_msgs/TransformStamped',
  ['std_msgs/Header header', 'string child_frame_id', 'Transform transform'],
];
const KEY_VALUE: RosSection = ['diagnostic_msgs/KeyValue', ['string key', 'string value']];
const DIAGNOSTIC_STATUS: RosSection = [
  'diagnostic_msgs/DiagnosticStatus',
  [
    'byte OK=0',
    'byte WARN=1',
    'byte ERROR=2',
    'byte STALE=3',
    'byte level',
    'string name',
    'string message',
    'string hardware_id',
    'KeyValue[] values',
  ],
];
const POINT_FIELD: RosSection = [
  'sensor_msgs/PointField',
  [
    'uint8 INT8    = 1',
    'uint8 UINT8   = 2',
    'uint8 INT16   = 3',
    'uint8 UINT16  = 4',
    'uint8 INT32   = 5',
    'uint8 UINT32  = 6',
    'uint8 FLOAT32 = 7',
    'uint8 FLOAT64 = 8',
    'string name      # Name of field',
    'uint32 offset    # Offset from start of point struct',
    'uint8  datatype  # Datatype enumeration, see above',
    'uint32 count     # How many elements in the field',
  ],
];

const fixture = (name: string, main: string[], dependencies: RosSection[]) => ({
  name,
  text: definitionText(main, dependencies),
});

export const ROS2_IMU = fixture(
  'sensor_msgs/msg/Imu',
  [
    'std_msgs/Header header',
    'geometry_msgs/Quaternion orientation',
    'float64[9] orientation_covariance # Row major about x, y, z axes',
    'geometry_msgs/Vector3 angular_velocity',
    'float64[9] angular_velocity_covariance',
    'geometry_msgs/Vector3 linear_acceleration',
    'float64[9] linear_acceleration_covariance',
  ],
  [ROS2_HEADER, ROS2_TIME, QUATERNION, VECTOR3],
);

export const ROS2_ODOMETRY = fixture(
  'nav_msgs/msg/Odometry',
  [
    '# Estimated pose and velocity in free space.',
    'std_msgs/Header header',
    'string child_frame_id',
    'geometry_msgs/PoseWithCovariance pose',
    'geometry_msgs/TwistWithCovariance twist',
  ],
  [ROS2_HEADER, ROS2_TIME, POSE_COVARIANCE, POSE, POINT, QUATERNION, TWIST_COVARIANCE, TWIST, VECTOR3],
);

export const ROS2_LASER_SCAN = fixture(
  'sensor_msgs/msg/LaserScan',
  [
    'std_msgs/Header header # timestamp in the header is the acquisition time of the first ray',
    '',
    'float32 angle_min            # start angle of the scan [rad]',
    'float32 angle_max            # end angle of the scan [rad]',
    'float32 angle_increment      # angular distance between measurements [rad]',
    'float32 time_increment       # time between measurements [seconds]',
    'float32 scan_time            # time between scans [seconds]',
    'float32 range_min            # minimum range value [m]',
    'float32 range_max            # maximum range value [m]',
    'float32[] ranges             # range data [m]',
    'float32[] intensities        # intensity data [device-specific units]',
  ],
  [ROS2_HEADER, ROS2_TIME],
);

export const ROS2_TF_MESSAGE = fixture(
  'tf2_msgs/msg/TFMessage',
  ['geometry_msgs/TransformStamped[] transforms'],
  [TRANSFORM_STAMPED, ROS2_HEADER, ROS2_TIME, TRANSFORM, VECTOR3, QUATERNION],
);

export const ROS2_COMPRESSED_IMAGE = fixture('sensor_msgs/msg/CompressedImage', COMPRESSED_IMAGE_FIELDS, [
  ROS2_HEADER,
  ROS2_TIME,
]);

export const ROS2_JOINT_STATE = fixture('sensor_msgs/msg/JointState', JOINT_STATE_FIELDS, [ROS2_HEADER, ROS2_TIME]);

export const ROS2_LOG = fixture(
  'rcl_interfaces/msg/Log',
  [
    'byte DEBUG=10',
    'byte INFO=20',
    'byte WARN=30',
    'byte ERROR=40',
    'byte FATAL=50',
    'builtin_interfaces/Time stamp',
    'uint8 level',
    'string name',
    'string msg',
    'string file',
    'string function',
    'uint32 line',
  ],
  [ROS2_TIME],
);

export const ROS2_DIAGNOSTIC_ARRAY = fixture(
  'diagnostic_msgs/msg/DiagnosticArray',
  ['std_msgs/Header header', 'DiagnosticStatus[] status'],
  [ROS2_HEADER, ROS2_TIME, DIAGNOSTIC_STATUS, KEY_VALUE],
);

export const ROS2_STRING = fixture('std_msgs/msg/String', ['string data'], []);

export const ROS2_POINT_CLOUD2 = fixture(
  'sensor_msgs/msg/PointCloud2',
  [
    'std_msgs/Header header',
    'uint32 height',
    'uint32 width',
    'PointField[] fields',
    'bool    is_bigendian # Is this data bigendian?',
    'uint32  point_step   # Length of a point in bytes',
    'uint32  row_step     # Length of a row in bytes',
    'uint8[] data         # Actual point data, size is (row_step*height)',
    'bool is_dense        # True if there are no invalid points',
  ],
  [ROS2_HEADER, ROS2_TIME, POINT_FIELD],
);

export const ROS1_JOINT_STATE = fixture('sensor_msgs/JointState', JOINT_STATE_FIELDS, [ROS1_HEADER]);

export const ROS1_LOG = fixture(
  'rosgraph_msgs/Log',
  [
    'byte DEBUG=1 #debug level',
    'byte INFO=2  #general level',
    'byte WARN=4  #warning level',
    'byte ERROR=8 #error level',
    'byte FATAL=16 #fatal/critical level',
    'Header header',
    'byte level',
    'string name # name of the node',
    'string msg # message',
    'string file # file the message came from',
    'string function # function the message came from',
    'uint32 line # line the message came from',
    'string[] topics # topic names that the node publishes',
  ],
  [ROS1_HEADER],
);

export const ROS1_STRING = fixture('std_msgs/String', ['string data'], []);
