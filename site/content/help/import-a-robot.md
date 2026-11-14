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

You can bring a published robot into Basecase with its joints, limits and masses. Import it from a GitHub or Hugging Face link, from a zip, or from files on your computer.

1. Press [[⌘K]] and choose **Import Robot**.
2. Paste a link to a GitHub or Hugging Face repo or folder, a URDF or MJCF file, or a zip.
3. Click **Import**.

![Import Robot with a GitHub repo link](/help/import-a-robot/link.png)

Basecase searches the repo or zip for the robot's description, and uses MJCF first if it finds it. It inserts the robot with its joints ready to pose.

If the repo holds more than one robot, the sheet lists all of them. Click the one you want, then click **Import**.

![The list of robots in a repo](/help/import-a-robot/choose.png)

You can also find **Import Robot** in the **File** menu.

To import a robot from your computer, do any of the following:

- Click **Choose Folder** in the sheet.
- Drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas.
- Choose **Import** in the canvas menu, then pick the file.

The robot appears where you dropped it, or where you right-clicked.

## Insert a robot from the shelf

The **Robots** section of Parts has ready-made robots, grouped by kind: **Humanoids**, **Small bipeds**, **Quadrupeds** and **Arms**. They include the Unitree G1, Go2 and SO-101.

- To insert a robot, click a kind, then click the robot. Or drag the robot onto the canvas.
- To find a robot by name, type the name in **Search parts**, then press [[⌘↩]].

![Parts on its Robots section, with Imported, Humanoids, Small bipeds, Quadrupeds and Arms](/help/import-a-robot/robots.png)

Robots you've imported appear first, under **Imported**. Click one to insert it again. To remove a robot from this list, right-click it and choose **Delete**. Scenes that already use the robot keep it.

![An imported robot's right-click menu with Insert and Delete](/help/import-a-robot/imported.png)

## What comes in

- Each link that has geometry becomes its own part, with its mass and center of mass.
- Each revolute and prismatic joint keeps its axis, limits and torque limit.
- Basecase never prints or resizes robot parts.

Robots exported from Fusion 360 with fusion2urdf import the same way, and so do ROS description packages written in xacro. Choose the package folder, drop it on the canvas, or paste the link to its repo.

If a xacro package also includes a plain `.urdf`, Basecase uses that file. If it doesn't, Basecase reads the top-level `.xacro` or `.urdf.xacro` file and follows its includes inside the package, filling in the properties, macros and `xacro:arg` defaults as it goes. If a xacro needs something Basecase can't fill in, such as a YAML file or an environment variable, the import stops and tells you which file caused it.

A Hugging Face dataset link, or a folder or zip that holds a LeRobot dataset or a ROS 2 recording, adds tries to the robot in the scene. To learn how, see [Import robot data as tries](/help/import-robot-data-as-tries).

**Note:** Links must use https. A zip link can download up to 200 MB, and a zip can unpack to at most 600 MB and 20,000 files. If a link doesn't contain a robot description, you'll see a single toast that names the link.

To learn how the joints work once the robot is in your scene, see [Joints and kinematics](/help/joints-and-kinematics).
