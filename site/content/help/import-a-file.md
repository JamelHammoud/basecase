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
  - step
  - stp
  - iges
  - igs
  - cad
  - solidworks
  - fusion
  - onshape
  - freecad
  - assembly
  - manufacturer cad
  - b-rep
  - svg
  - urdf
  - bvh
  - import mesh
  - thingiverse
  - printables
  - model file
  - open file
related:
  - import-a-robot
  - save-a-model-to-the-library
covers:
  - src/workspace/importRoute.ts
  - src/workspace/useFileImport.ts
  - src/workspace/meshImport.ts
  - src/workspace/cadImport.ts
  - src/workspace/usePartCreation.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/exchangeCommands.tsx
  - electron/app-menu.mjs
  - electron/cadImport/openCadFile.mjs
  - electron/cadImport/bodiesPolicy.mjs
  - electron/cadImport/convertPolicy.mjs
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

A BVH motion file opens the retarget sheet for the selected robot. With no robot in the scene, it opens [Design From Motion](/help/design-a-robot-from-a-motion) instead. Images become reference images, and a `.basecase` file opens in a new tab.

Import is also in File ▸ Import and in [[⌘K]]. Dropping files on the canvas does the same, at the spot where you drop them. A dropped `.mid` file plays in a Case's tries instead, as in [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Units and axes

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

A model under 1 mm across is read as meters instead. Meshes are never simplified, so a print keeps every triangle. FBX textures are left out.

## STEP and IGES files

Opening STEP and IGES works in the desktop app. Each body in the file becomes its own part, named from the file's product names and colored with its main face color. A file with more than one body arrives as a group named after the file.

The file is converted in a sandbox, apart from the rest of the app. Units come from the file itself, so every body arrives in millimeters at its real size.

Imported bodies count as printed parts, like any imported mesh. To mark a body as bought or machined, select it. Then change the material under **Appearance** from **Printed PLA / PETG** to **Off-the-shelf** or **CNC aluminum**. Checks then list it among parts without a source until it has one.

- Files up to 200 MB open.
- A file with more than 1,000 bodies doesn't open.
- Past 200,000 triangles in total, the shapes are simplified to fit.
- Conversion stops after 2.5 minutes.

If a file doesn't come in, follow [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
