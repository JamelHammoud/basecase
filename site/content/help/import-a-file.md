---
title: Import a file
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 15
keywords:
  - stl
  - 3mf
  - obj
  - ply
  - fbx
  - glb
  - gltf
  - dae
  - collada
  - svg
  - urdf
  - bvh
  - import mesh
  - thingiverse
  - printables
  - model file
  - open file
related:
  - open-a-step-or-iges-file
  - import-a-robot
  - save-a-model-to-the-library
covers:
  - src/workspace/importRoute.ts
  - src/workspace/useFileImport.ts
  - src/workspace/meshImport.ts
  - src/workspace/usePartCreation.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/exchangeCommands.tsx
  - electron/app-menu.mjs
---

Bring a file from another app into the scene. One command takes every kind of file Basecase reads, and each kind goes where it belongs.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Pick one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

Meshes and CAD files become parts, selected and ready to move: STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE, plus STEP, STP, IGES and IGS in the desktop app. They land where you right-clicked.

An SVG opens the Import SVG panel with the drawing loaded. Set its width and thickness there, then click **Add** to extrude it into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

A URDF, MJCF or zip, such as an exported Robot Package, comes in as a robot with its joints.

A BVH motion file opens the retarget sheet for the selected robot. Images become reference images, and a `.basecase` file opens in a new tab.

Import is also in File ▸ Import and in ⌘K. Dropping files on the canvas does the same, at the spot where you drop them.

## Units and axes

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

A model under 1 mm across is read as meters instead. Meshes are never simplified, so a print keeps every triangle. FBX textures are left out.

If a file doesn't come in, follow [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
