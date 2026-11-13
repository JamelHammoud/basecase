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

Take a robot you designed to MuJoCo, ROS or LeRobot as one zip. Robot Package turns on once the scene has a movable joint.

1. Click **Export** at the top right.
2. Choose **Robot Package**. It's also **Export Robot Package** in ⌘K.

![The Export menu with Robot Package](/help/export-a-robot-package/menu.png)

Basecase saves `<scene>-robot.zip` to your downloads. It holds:

- `robot.xml`, the MuJoCo model Simulate runs, unchanged.
- `robot.urdf` with one STL mesh per part in `meshes/`, and each link's mass and inertia.
- `joint_map.json`, one entry per movable joint: servo id, joint name, servo type, zero offset, direction, limits and the active calibration.
- `policies/`, one folder per trained policy, with the policy and a `spec.json` describing its observations and actions by joint name.

![The toast after the package is saved](/help/export-a-robot-package/exported.png)
