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

You can bring in a published robot, with its joints, limits and masses, from a GitHub or Hugging Face link, a zip, or files on your computer.

1. Press [[⌘K]] and choose **Import Robot**.
2. Paste a link to a GitHub or Hugging Face repo or folder, a URDF or MJCF file, or a zip.
3. Click **Import**.

![Import Robot with a GitHub repo link](/help/import-a-robot/link.png)

Basecase looks for the robot's description in the repo or zip (it prefers MJCF), then inserts the robot with its joints ready to pose. If the repo holds several robots, the sheet lists them. Click the one you want, then click **Import**.

![The list of robots in a repo](/help/import-a-robot/choose.png)

You can also find **Import Robot** in **File**.

To import from your computer, do any of these:

- Click **Choose Folder** in the sheet.
- Drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas.
- Pick the file with **Import** in the canvas menu.

Basecase inserts the robot right away, where you dropped it or where you right-clicked.

## Insert a robot from the shelf

Parts lists ready-made robots under **Robots**, grouped by kind: **Humanoids**, **Small bipeds**, **Quadrupeds** and **Arms**. These include the Unitree G1, Go2 and SO-101.

- To insert a robot, click a kind, then click the robot. Or drag the robot onto the canvas.
- To find a robot by name, type it in **Search parts** and press [[⌘↩]].

![Parts on its Robots section, with Imported, Humanoids, Small bipeds, Quadrupeds and Arms](/help/import-a-robot/robots.png)

Robots you've imported come first, under **Imported**, so you can insert them again with one click. To remove one from the list, right-click it and choose **Delete**. Scenes that already use the robot keep it.

![An imported robot's right-click menu with Insert and Delete](/help/import-a-robot/imported.png)

## What comes in

- Every link with geometry becomes its own part, with its mass and center of mass.
- Every revolute and prismatic joint keeps its axis, limits and torque limit.
- Basecase never prints or resizes robot parts.

Robots exported from Fusion 360 with fusion2urdf import the same way, and so do ROS description packages written in xacro. Choose the package folder, drop it on the canvas, or paste its repo link.

For a xacro package, Basecase reads the top-level `.xacro` or `.urdf.xacro` file and follows its includes inside the package. It fills in the properties, macros and `xacro:arg` defaults. If the package also has a plain `.urdf`, Basecase uses that file instead. If a xacro needs something Basecase can't fill in, like a YAML file or an environment variable, the import stops and names the file.

Links must use https. A zip link downloads up to 200 MB, and a zip unpacks up to 600 MB and 20,000 files. If a link has no robot description, you see one toast that names the link.

To learn how the joints work once the robot is in, see [Joints and kinematics](/help/joints-and-kinematics).
