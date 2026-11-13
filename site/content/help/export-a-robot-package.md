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

Save a robot with movable joints as one zip: its MuJoCo model, a URDF with STL meshes, its servo joint map and trained policies.

1. Click **Export** at the top right.
2. Choose **Robot Package**.

![The Export menu with Robot Package](/help/export-a-robot-package/menu.png)

A toast shows the progress, then names the package when it's saved. Basecase saves `<scene>-robot.zip` to your downloads.

![The toast after the package is saved](/help/export-a-robot-package/exported.png)

**Export Robot Package** is also in ⌘K. Until the scene has a joint that turns or slides, the menu item is greyed out and the command is hidden.

## What reads it

- **MuJoCo** loads `robot.xml` as it is. It's the model the Simulate tab runs, and needs no other file.
- **URDF tools** that accept mesh paths relative to the file can load `robot.urdf`. Keep the `meshes/` folder beside it.
- `joint_map.json` uses the same keys as the calibration file Basecase's robot daemon reads, with servo ids, limits and calibration.

The package isn't a ROS package or a LeRobot dataset. It has no ROS package files, and the policies are in Basecase's own JSON format. To give LeRobot data it can load, [publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face) from a Case. Joint names match across the package and those datasets.

Every file in the zip is listed in [Robot package contents](/help/robot-package-contents).
