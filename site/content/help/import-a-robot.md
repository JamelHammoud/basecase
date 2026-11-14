---
title: Import a robot
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 16
popular: true
keywords:
  - urdf
  - mjcf
  - mujoco xml
  - github
  - hugging face
  - ros
  - zip
  - unitree
  - so-101
  - humanoid
  - quadruped
  - arm
  - preset
related:
  - joints-and-kinematics
  - export-a-robot-package
covers:
  - src/components/ImportRobotSheet.tsx
  - src/components/parts/robotViews.tsx
  - src/workspace/useCanvasDrop.ts
  - src/workspace/droppedFolders.ts
  - src/workspace/useFileImport.ts
  - src/workspace/useRobotInsert.ts
  - src/utils/robotImport/
---

Bring in a published robot with its joints, limits and masses, from a GitHub or Hugging Face link, a zip, or files on your computer.

1. Press [[⌘K]] and choose **Import Robot**.
2. Paste a link to a GitHub or Hugging Face repo or folder, a URDF or MJCF file, or a zip.
3. Click **Import**.

![Import Robot with a GitHub repo link](/help/import-a-robot/link.png)

Basecase finds the robot's description in the repo or zip, preferring MJCF, and inserts it with its joints ready to pose. If the repo holds several robots, the sheet lists them: click the one you want, then **Import**.

![The list of robots in a repo](/help/import-a-robot/choose.png)

**Import Robot** is also in **File**. To import from your computer, click **Choose Folder** in the sheet. You can also drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas, or pick the file with **Import** in the canvas menu. Import Robot opens with it loaded; click **Import** and the robot stands where you dropped it.

## Insert a robot from the shelf

Parts lists ready robots under **Robots**, by kind: **Humanoids**, **Small bipeds**, **Quadrupeds** and **Arms**, such as the Unitree G1, Go2 and SO-101. Click a kind, then click a robot to insert it, or drag it onto the canvas. To find one by name, type it in **Search parts** and press [[⌘Enter]].

![Parts on its Robots section, with Imported, Humanoids, Small bipeds, Quadrupeds and Arms](/help/import-a-robot/robots.png)

Robots you imported come first, under **Imported**, so you can insert them again with a click. To take one off the list, right-click it and choose **Delete**. Scenes that already use it keep it.

![An imported robot's right-click menu with Insert and Delete](/help/import-a-robot/imported.png)

## What comes in

- Every link with geometry becomes its own part, with its mass and center of mass.
- Every revolute and prismatic joint keeps its axis, limits and torque limit.
- Robot parts are never printed or resized.

Robots exported from Fusion 360 with fusion2urdf, and ROS description packages written in xacro, import the same way. Choose the package folder, drop it on the canvas, or paste its repo link. Basecase reads the top-level `.xacro` or `.urdf.xacro` file, follows its includes inside the package, and fills in its properties, macros and `xacro:arg` defaults. When the package also has a plain `.urdf`, that file is used instead. If a xacro needs something Basecase can't fill in, like a YAML file or an environment variable, the import stops and names the file.

Links must be https. A zip link downloads up to 200 MB, and a zip unpacks up to 600 MB and 20,000 files. A link with no robot description shows one toast naming the link.

To see how the joints work once the robot is in, read [Joints and kinematics](/help/joints-and-kinematics).
