---
title: Import a robot
date: 2026-11-12
updated: 2026-11-14
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

You can import a published robot, with its joints, limits and masses, from a GitHub or Hugging Face link, a zip, or files on your computer.

1. Press [[⌘K]] and choose **Import Robot**.
2. Paste a link to a GitHub or Hugging Face repo or folder, a URDF or MJCF file, or a zip.
3. Click **Import**.

![Import Robot with a GitHub repo link](/help/import-a-robot/link.png)

Basecase looks for the robot's description in the repo or zip, and prefers MJCF. Then it inserts the robot with its joints ready to pose. If the repo holds several robots, the sheet lists them. Click the one you want, then click **Import**.

![The list of robots in a repo](/help/import-a-robot/choose.png)

**Import Robot** is also in the **File** menu.

To import a robot from your computer, take any of these actions:

- Click **Choose Folder** in the sheet.
- Drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas.
- Choose **Import** in the canvas menu, then pick the file.

Basecase inserts the robot right away, where you dropped it or where you right-clicked.

## Insert a robot from the shelf

Parts lists ready-made robots under **Robots**, grouped by kind: **Humanoids**, **Small bipeds**, **Quadrupeds** and **Arms**. You'll find the Unitree G1, Go2 and SO-101 there.

- To insert a robot, click a kind, then click the robot. Or drag the robot onto the canvas.
- To find a robot by name, type it in **Search parts** and press [[⌘↩]].

![Parts on its Robots section, with Imported, Humanoids, Small bipeds, Quadrupeds and Arms](/help/import-a-robot/robots.png)

Robots you've imported are listed first, under **Imported**, so you can insert them again with one click. To remove a robot from this list, right-click it and choose **Delete**. Scenes that already use the robot keep it.

![An imported robot's right-click menu with Insert and Delete](/help/import-a-robot/imported.png)

## What comes in

- Every link with geometry becomes its own part, with its mass and center of mass.
- Every revolute and prismatic joint keeps its axis, limits and torque limit.
- Basecase never prints or resizes robot parts.

Robots exported from Fusion 360 with fusion2urdf import the same way, as do ROS description packages written in xacro. Choose the package folder, drop it on the canvas, or paste the link to its repo.

When a xacro package also has a plain `.urdf`, Basecase uses that file. Otherwise it reads the top-level `.xacro` or `.urdf.xacro` file, follows its includes inside the package, and fills in the properties, macros and `xacro:arg` defaults. A xacro that needs something Basecase can't fill in, such as a YAML file or an environment variable, stops the import, and Basecase tells you which file it needs.

Links must use https. A zip link downloads up to 200 MB, and a zip unpacks up to 600 MB and 20,000 files. A link with no robot description shows a single toast that names the link.

If you import a Hugging Face dataset link, or a folder or zip that holds a LeRobot dataset or a ROS 2 recording, Basecase adds tries to the robot in the scene instead. See [Import robot data as tries](/help/import-robot-data-as-tries).

To learn how the joints work after you import a robot, see [Joints and kinematics](/help/joints-and-kinematics).
