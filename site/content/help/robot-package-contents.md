---
title: Robot package contents
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: reference
order: 2
keywords:
  - mjcf
  - urdf
  - joint_map.json
  - spec.json
  - policy.json
  - stl meshes
  - package.xml
  - ros2_control
  - zip
related:
  - export-a-robot-package
  - publish-a-dataset-to-hugging-face
covers:
  - src/sim/robotPackage/buildRobotPackage.ts
  - src/sim/robotPackage/jointMap.ts
  - src/sim/robotPackage/policyFiles.ts
  - src/sim/robotPackage/rosPackage.ts
  - src/utils/robotImport/urdfWriter.ts
---

**Export** ▸ **Robot Package** saves your robot as a zip file that unpacks to a single folder named `<scene>-robot`. Lengths are in meters and angles in radians, with Z up.

## Files

| File | What it holds |
|---|---|
| `robot.xml` | The same MuJoCo model the Simulate tab runs, with everything in the simulation, including scenery. Basecase writes the collision shapes into this file, so it needs no other file. |
| `urdf/robot.urdf` | One link for each body of the robot and one joint for each link, with the same names as in `robot.xml`. Each link carries the mass of its parts, its center of mass and its inertia. The root link is a massless `base_link`. A `ros2_control` block lists every movable joint with a position command and its limits, using ROS 2's mock hardware. |
| `meshes/<part>.stl` | One binary STL for each part, placed in its link's frame. The URDF points to each mesh by its `package://` path and uses it for both visuals and collisions. |
| `joint_map.json` | One entry for each movable joint, with its servo id, joint name, type, servo bus, servo part, zero offset, direction, limits and active calibration. |
| `policies/<id>/policy.json` | A trained policy, including its weights, in the form Basecase runs it. |
| `policies/<id>/spec.json` | The policy's inputs and their sizes, the names of the joints it moves, the default pose, the action scale and the control step. |
| `package.xml` | The ROS 2 package manifest, named after the robot with `_description` added, for example `arm_description`. The export leaves placeholders for the maintainer and license, so fill those in yourself. |
| `CMakeLists.txt` | Installs `urdf/`, `meshes/`, `launch/`, `rviz/`, `robot.xml` and `joint_map.json` when colcon builds the package. |
| `launch/display.launch.py` | Starts `robot_state_publisher`, the Joint State Publisher window and RViz, using the installed URDF. |
| `rviz/display.rviz` | The RViz layout the launch file opens, with a grid and the robot model. |

## joint_map.json

| Key | Meaning |
|---|---|
| `id` | The servo id, numbered from 1 in joint order |
| `name` | The joint's name in `robot.xml` and `urdf/robot.urdf` |
| `joint` | The joint's label in the scene |
| `type` | `revolute`, `continuous` or `prismatic` |
| `family` | The servo's bus: `feetech`, `dynamixel`, or null for other servos |
| `servo` | The servo from Parts, as `componentId` and `variant`, or null |
| `zero_counts` | The servo reading at the joint's 0°. This is 2048 until **Calibrate Servos** finds the real value. |
| `direction` | 1, or -1 if **Calibrate Servos** finds the servo turns the joint the other way |
| `min_rad`, `max_rad` | The limits of a joint that turns |
| `min_m`, `max_m` | The limits of a joint that slides |
| `calibration` | The servo's active calibration, or null |

## What's left out

If your scene has no trained policy, the zip has no `policies` folder. If Basecase can't find a policy's file, it skips that policy. The zip doesn't include ONNX copies of policies.

To make the zip, follow [Export a robot package](/help/export-a-robot-package).
