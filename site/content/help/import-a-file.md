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

Use Import to bring files from other apps into your scene. The same command opens every file type Basecase reads.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Select one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

Meshes and CAD files become parts. Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE files, and the desktop app also reads STEP, STP, IGES and IGS. The new parts appear where you right-clicked, selected and ready to move.

If you choose an SVG file, the Import SVG panel opens with your drawing loaded. Set the width and thickness, then click **Add** to extrude the drawing into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

- A URDF, MJCF or zip file (such as an exported Robot Package) loads as a robot with its joints.
- A BVH motion file opens the retarget sheet for the selected robot. If the scene has no robot, it opens [Design From Motion](/help/design-a-robot-from-a-motion).
- An image becomes a reference image.
- A `.basecase` file opens in a new tab.

**File** ▸ **Import** and [[⌘K]] also open Import. To import files at a specific spot, drop them on the canvas. If you drop a `.mid` file, it plays in a Case's tries instead. See [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Units and axes

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

Basecase reads a model that measures less than 1 mm across as meters. It never simplifies a mesh, so your print keeps every triangle. FBX files import without their textures.

## STEP and IGES files

In the desktop app, each body in a STEP or IGES file becomes its own part, named from the file's product names and colored with the body's main face color. A file with more than one body comes in as a group of parts named after the file.

Basecase converts the file in a sandbox, separate from the rest of the app. It takes units from the file itself, so each body arrives in millimeters at its real size.

An imported body counts as a printed part, like any imported mesh. To mark a body as bought or machined, select it, then under **Appearance** change the material from **Printed PLA / PETG** to **Off-the-shelf** or **CNC aluminum**. Checks then list it among parts without a source until it has one.

STEP and IGES imports have these limits:

- A file can be up to 200 MB.
- A file can have up to 1,000 bodies.
- If the bodies add up to more than 200,000 triangles, Basecase simplifies the shapes to fit.
- Basecase stops converting after 2.5 minutes.

If a file doesn't import, see [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
