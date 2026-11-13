---
title: Export a robot package
date: 2026-11-12
covers:
  - src/workspace/robotPackageExport.ts
  - src/workspace/useExportActions.ts
  - src/components/ExportMenu.tsx
  - src/workspace/exchangeCommands.tsx
  - src/sim/robotPackage/
---

Take a robot you designed to MuJoCo, ROS 2 or LeRobot as one zip. Robot Package turns on once the scene has a movable joint.

1. Click **Export** at the top right.
2. Choose **Robot Package**. It's also **Export Robot Package** in ⌘K.

![The Export menu with Robot Package](/help/export-a-robot-package/menu.png)

Basecase saves `<scene>-robot.zip` to your downloads. It holds:

- `robot.xml`, the MuJoCo model Simulate runs, unchanged.
- `urdf/robot.urdf` with one STL mesh per part in `meshes/`, each link's mass and inertia, and a `ros2_control` block with a position command per movable joint.
- `package.xml`, `CMakeLists.txt`, `launch/display.launch.py` and `rviz/display.rviz`, which make the folder a ROS 2 package named after the robot, like `arm_description`.
- `joint_map.json`, one entry per movable joint: servo id, joint name, servo type, zero offset, direction, limits and the active calibration.
- `policies/`, one folder per trained policy, with the policy and a `spec.json` describing its observations and actions by joint name.

![The toast after the package is saved](/help/export-a-robot-package/exported.png)

To see the robot in RViz on a machine with ROS 2:

1. Unzip it into the `src` folder of a colcon workspace.
2. Run `colcon build`, then `source install/setup.bash`.
3. Run `ros2 launch arm_description display.launch.py`, with your package's name from `package.xml`.

RViz opens with the robot model, and the Joint State Publisher window has a slider per joint. The `ros2_control` block uses ROS 2's mock hardware; change its `plugin` to your robot's driver to drive the real servos.
