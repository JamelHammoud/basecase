---
title: Export a robot package
date: 2026-11-12
updated: 2026-11-13
collection: build-and-print
type: task
order: 8
keywords:
  - mjcf
  - urdf
  - ros 2
  - rviz
  - colcon
  - ros2_control
  - mujoco
  - zip
  - joint map
  - policy
  - download robot
related:
  - robot-package-contents
  - publish-a-dataset-to-hugging-face
  - share-a-scene
covers:
  - src/workspace/robotPackageExport.ts
  - src/workspace/useExportActions.ts
  - src/components/ExportMenu.tsx
  - src/workspace/exchangeCommands.tsx
  - src/sim/robotPackage/
  - src/utils/robotImport/urdfWriter.ts
---

Save a robot with movable joints as one zip for MuJoCo and ROS 2: its model, a URDF with meshes, its servo joint map and trained policies.

1. Click **Export** at the top right.
2. Choose **Robot Package**.

![The Export menu with Robot Package](/help/export-a-robot-package/menu.png)

A toast shows the progress, then names the package when it's saved. Basecase saves `<scene>-robot.zip` to your downloads.

![The toast after the package is saved](/help/export-a-robot-package/exported.png)

**Export Robot Package** is also in [[⌘K]]. Until the scene has a joint that turns or slides, the menu item is grayed out and the command is hidden.

## Open it in ROS 2

The zip is also a ROS 2 description package, named after the robot: a robot called arm becomes `arm_description`. On a machine with ROS 2:

1. Unzip the package into the `src` folder of a colcon workspace.
2. Run `colcon build`, then `source install/setup.bash`.
3. Run `ros2 launch arm_description display.launch.py`, with your package's name from `package.xml`.

RViz opens with the robot, and the Joint State Publisher window has a slider per joint. The URDF's `ros2_control` block uses ROS 2's mock hardware. To drive real servos, change its `plugin` to your robot's driver.

## What reads it

- **MuJoCo** loads `robot.xml` as it is. It's the model the Simulate tab runs, and needs no other file.
- **ROS 2** builds the folder with `colcon build`. The URDF is in `urdf/` and finds its meshes by `package://` path.
- `joint_map.json` uses the same keys as the calibration file Basecase's robot daemon reads, with servo ids, zeros, directions, limits and calibration.

The package isn't a LeRobot dataset, and the policies are in Basecase's own JSON format. To give LeRobot data it can load, [publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face) from a Case. Joint names match across the package and those datasets.

Every file in the zip is listed in [Robot package contents](/help/robot-package-contents).
