---
title: Import a robot
date: 2026-11-12
covers:
  - src/components/ImportRobotSheet.tsx
  - src/workspace/useCanvasDrop.ts
  - src/workspace/droppedRobot.ts
  - src/workspace/useRobotInsert.ts
  - src/utils/robotImport/
---

Bring in a published robot with its joints, limits and masses, from a link or from files on your computer.

1. Press ⌘K and choose **Import Robot**. It's also in File ▸ Import Robot and the + at the top of the Robots view.
2. Paste a link to a GitHub repo or folder, a URDF or MJCF file, or a zip.
3. Press Enter.

![Import Robot with a GitHub repo link](/help/import-a-robot/link.png)

Basecase finds the robot's description in the repo or zip, preferring MJCF, and inserts it. When a repo holds several robots, it lists them:

1. Click the robot you want.
2. Click **Import**.

![The list of robots in a repo](/help/import-a-robot/choose.png)

To import from files instead, drag a robot's folder, zip, URDF or MJCF file onto the canvas. The robot stands where you drop it. **Choose Folder** in Import Robot does the same for a folder.
