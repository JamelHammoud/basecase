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

Every file in the zip that Export ▸ Robot Package saves, and what each one holds.

The zip unpacks to one folder named `<scene>-robot`. Lengths are in metres and angles in radians, with Z up.

## Files

| File | What it holds |
|---|---|
| `robot.xml` | The MuJoCo model the Simulate tab runs, unchanged. Collision shapes are written inside it, so it needs no other file. It holds everything the simulation holds, scenery included. |
| `urdf/robot.urdf` | One link per body of the robot and one joint per link, named as in `robot.xml`. Each link has the mass of its parts, its centre of mass and its inertia. The root is a massless `base_link`. A `ros2_control` block lists each movable joint with a position command and its limits, on ROS 2's mock hardware. |
| `meshes/<part>.stl` | One binary STL per part, already placed in its link's frame. The URDF uses each one for both looks and collisions, by `package://` path. |
| `joint_map.json` | One entry per movable joint: servo id, joint name, type, servo bus, servo part, zero offset, direction, limits and the active calibration. |
| `policies/<id>/policy.json` | A trained policy as Basecase runs it, weights included. |
| `policies/<id>/spec.json` | What the policy reads and drives: its inputs and their sizes, the joints it moves by name, the default pose, the action scale and the control step. |
| `package.xml` | The ROS 2 package manifest, named after the robot with `_description` added, such as `arm_description`. Its maintainer and license are placeholders to fill in. |
| `CMakeLists.txt` | Installs `urdf/`, `meshes/`, `launch/`, `rviz/`, `robot.xml` and `joint_map.json` when colcon builds the package. |
| `launch/display.launch.py` | Starts `robot_state_publisher`, the Joint State Publisher window and RViz on the installed URDF. |
| `rviz/display.rviz` | The RViz layout the launch file opens: a grid and the robot model. |

## joint_map.json

| Key | Meaning |
|---|---|
| `id` | The servo id, from 1 in joint order |
| `name` | The joint's name in `robot.xml` and `urdf/robot.urdf` |
| `joint` | The joint's label in the scene |
| `type` | `revolute`, `continuous` or `prismatic` |
| `family` | The servo's bus: `feetech`, `dynamixel`, or null for other servos |
| `servo` | The servo from Parts, as `componentId` and `variant`, or null |
| `zero_counts` | 2048, the default zero until calibration |
| `direction` | 1, the default until calibration |
| `min_rad`, `max_rad` | Limits of a joint that turns |
| `min_m`, `max_m` | Limits of a joint that slides |
| `calibration` | The servo's active calibration, or null |

## What's left out

Scenes with no trained policy have no `policies` folder. A policy whose file can't be found is left out. ONNX copies of policies aren't included.

To make the zip, follow [Export a robot package](/help/export-a-robot-package).
