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

Import brings files from other apps into your scene. One command opens every kind of file Basecase reads, and what you get depends on the kind of file.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Pick one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

Meshes and CAD files become parts. Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE files, and the desktop app also reads STEP, STP, IGES and IGS. The new parts appear where you right-clicked, selected and ready to move.

If you pick an SVG, the Import SVG panel opens with the drawing loaded. Set the width and thickness, then click **Add** to extrude the drawing into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

A URDF, MJCF or zip file (such as an exported Robot Package) comes in as a robot with its joints. A BVH motion file opens the retarget sheet for the selected robot. With no robot in the scene, it opens [Design From Motion](/help/design-a-robot-from-a-motion) instead. Images are added as reference images, and a `.basecase` file opens in a new tab.

You can also open Import from **File** ▸ **Import** or with [[⌘K]]. To import files at a specific spot, drop them on the canvas. A dropped `.mid` file plays in a Case's tries instead. To learn how, see [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Units and axes

Basecase reads each format in these units, with this up axis:

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

If a model measures less than 1 mm across, Basecase reads it as meters. Meshes are never simplified, so your print keeps every triangle. FBX textures aren't imported.

## STEP and IGES files

The desktop app opens STEP and IGES files. Each body in the file becomes its own part, named from the file's product names and colored with the body's main face color. A file with more than one body comes in as a group of parts named after the file.

Conversion runs in a sandbox, separate from the rest of the app. Basecase takes units from the file itself, so every body arrives in millimeters at its real size.

Like any imported mesh, an imported body counts as a printed part. To mark a body as bought or machined, select it, then under **Appearance** change the material from **Printed PLA / PETG** to **Off-the-shelf** or **CNC aluminum**. Checks then list it among parts without a source until it has one.

These limits apply to STEP and IGES files:

- A file can be up to 200 MB.
- A file can have up to 1,000 bodies.
- If the bodies add up to more than 200,000 triangles, Basecase simplifies the shapes to fit.
- Conversion stops after 2.5 minutes.

If a file doesn't import, see [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
