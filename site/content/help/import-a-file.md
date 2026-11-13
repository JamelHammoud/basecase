---
title: Import a file
date: 2026-11-12
covers:
  - src/workspace/importRoute.ts
  - src/workspace/useFileImport.ts
  - src/workspace/meshImport.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/exchangeCommands.tsx
---

Bring a file from another app into the scene. One command takes every kind of file Basecase reads, and each kind goes where it belongs.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Pick one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

Meshes and CAD files become parts, selected and ready to move: STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE, plus STEP, STP, IGES and IGS in the desktop app. They land where you right-clicked.

An SVG opens the Import SVG panel with the drawing loaded. Set its width and thickness there, then click **Add** to extrude it into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

A URDF, MJCF or zip, such as an exported Robot Package, opens Import Robot with the file loaded. Click **Import** to insert the robot with its joints.

![Import Robot with a URDF loaded](/help/import-a-file/robot.png)

A BVH motion file opens the retarget sheet for the selected robot. Images become reference images, and a `.basecase` file opens in a new tab.

Import is also in File ▸ Import and in ⌘K. Dropping files on the canvas does the same, at the spot where you drop them.
