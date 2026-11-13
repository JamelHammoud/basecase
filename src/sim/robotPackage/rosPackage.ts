import { esc, f } from '../mjcfText';
import type { JointMap, JointMapEntry } from './jointMap';

export const ROS_PACKAGE_NAME = /^[a-z](_?[a-z0-9]+)*$/;
export const ROS_EXEC_DEPENDS = [
  'robot_state_publisher',
  'joint_state_publisher_gui',
  'rviz2',
  'launch_ros',
  'ament_index_python',
];
export const ROS_INSTALL_DIRS = ['urdf', 'meshes', 'launch', 'rviz'];
export const ROS_LAUNCH = 'launch/display.launch.py';
export const ROS_RVIZ = 'rviz/display.rviz';
export const ROS_URDF = 'urdf/robot.urdf';

const SUFFIX = '_description';

export function rosPackageName(robot: string): string {
  const words = robot
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = /^[a-z]/.test(words) ? words : `robot_${words}`.replace(/_+$/, '');

  return base.endsWith(SUFFIX) ? base : `${base}${SUFFIX}`;
}

export const packageUri = (name: string) => (path: string) => `package://${name}/${path}`;

export function packageXml(name: string, robot: string): string {
  return [
    '<?xml version="1.0"?>',
    '<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>',
    '<package format="3">',
    `  <name>${name}</name>`,
    '  <version>0.1.0</version>',
    `  <description>${esc(robot)} robot description exported from Basecase</description>`,
    '  <maintainer email="maintainer@example.com">Basecase</maintainer>',
    '  <license>TODO</license>',
    '',
    '  <buildtool_depend>ament_cmake</buildtool_depend>',
    '',
    ...ROS_EXEC_DEPENDS.map((d) => `  <exec_depend>${d}</exec_depend>`),
    '',
    '  <export>',
    '    <build_type>ament_cmake</build_type>',
    '  </export>',
    '</package>',
    '',
  ].join('\n');
}

interface CmakeInput {
  name: string;
  dirs: string[];
  rootFiles: string[];
}

export function cmakeLists({ name, dirs, rootFiles }: CmakeInput): string {
  return [
    'cmake_minimum_required(VERSION 3.8)',
    `project(${name})`,
    '',
    'find_package(ament_cmake REQUIRED)',
    '',
    `install(DIRECTORY ${dirs.join(' ')} DESTINATION share/\${PROJECT_NAME})`,
    `install(FILES ${rootFiles.join(' ')} DESTINATION share/\${PROJECT_NAME})`,
    '',
    'ament_package()',
    '',
  ].join('\n');
}

export function displayLaunch(name: string): string {
  return `import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    share = get_package_share_directory("${name}")
    with open(os.path.join(share, "urdf", "robot.urdf")) as urdf:
        robot_description = urdf.read()

    return LaunchDescription(
        [
            Node(
                package="robot_state_publisher",
                executable="robot_state_publisher",
                parameters=[{"robot_description": robot_description}],
            ),
            Node(package="joint_state_publisher_gui", executable="joint_state_publisher_gui"),
            Node(
                package="rviz2",
                executable="rviz2",
                arguments=["-d", os.path.join(share, "rviz", "display.rviz")],
            ),
        ]
    )
`;
}

export function displayRviz(fixedFrame: string): string {
  return `Panels:
  - Class: rviz_common/Displays
    Name: Displays
Visualization Manager:
  Class: ""
  Displays:
    - Class: rviz_default_plugins/Grid
      Name: Grid
      Enabled: true
      Plane: XY
      Reference Frame: <Fixed Frame>
    - Class: rviz_default_plugins/RobotModel
      Name: RobotModel
      Enabled: true
      Description Source: Topic
      Description Topic:
        Depth: 1
        Durability Policy: Transient Local
        History Policy: Keep Last
        Reliability Policy: Reliable
        Value: /robot_description
    - Class: rviz_default_plugins/TF
      Name: TF
      Enabled: false
  Global Options:
    Fixed Frame: ${JSON.stringify(fixedFrame)}
    Frame Rate: 30
  Tools:
    - Class: rviz_default_plugins/MoveCamera
    - Class: rviz_default_plugins/Select
  Views:
    Current:
      Class: rviz_default_plugins/Orbit
      Distance: 1
      Focal Point:
        X: 0
        Y: 0
        Z: 0.1
      Name: Current View
      Pitch: 0.5
      Yaw: 0.8
Window Geometry:
  Height: 800
  Width: 1200
`;
}

function commandLimits(j: JointMapEntry): string[] {
  const [min, max] = j.type === 'prismatic' ? [j.min_m, j.max_m] : [j.min_rad, j.max_rad];

  if (min === undefined || max === undefined) return [];

  return [`        <param name="min">${f(min)}</param>`, `        <param name="max">${f(max)}</param>`];
}

const controlJoint = (j: JointMapEntry) => [
  `    <joint name="${esc(j.name)}">`,
  '      <command_interface name="position">',
  ...commandLimits(j),
  '      </command_interface>',
  '      <state_interface name="position"/>',
  '      <state_interface name="velocity"/>',
  '    </joint>',
];

export function ros2Control(map: JointMap, urdfJoints: Set<string>): string[] {
  const joints = map.joints.filter((j) => urdfJoints.has(j.name));

  if (!joints.length) return [];

  return [
    `  <ros2_control name="${esc(map.robot)}" type="system">`,
    '    <hardware>',
    '      <plugin>mock_components/GenericSystem</plugin>',
    '    </hardware>',
    ...joints.flatMap(controlJoint),
    '  </ros2_control>',
  ];
}

interface RosFilesInput {
  name: string;
  robot: string;
  fixedFrame: string;
  files: string[];
}

const topDir = (path: string) => path.split('/')[0];

export function rosPackageFiles({ name, robot, fixedFrame, files }: RosFilesInput): Record<string, string> {
  const own = [...files, ROS_LAUNCH, ROS_RVIZ];
  const dirs = ROS_INSTALL_DIRS.filter((d) => own.some((p) => topDir(p) === d && p.includes('/')));
  const rootFiles = files.filter((p) => !p.includes('/')).sort();

  return {
    'package.xml': packageXml(name, robot),
    'CMakeLists.txt': cmakeLists({ name, dirs, rootFiles }),
    [ROS_LAUNCH]: displayLaunch(name),
    [ROS_RVIZ]: displayRviz(fixedFrame),
  };
}
