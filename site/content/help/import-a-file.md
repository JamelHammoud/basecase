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

Use Import to bring files from other apps into your scene. One command opens every format Basecase reads, and what you get depends on the format.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Select one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

Meshes and CAD files come in as parts. Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE files, and the desktop app adds STEP, STP, IGES and IGS. The new parts appear where you right-clicked, selected so you can move them.

If you choose an SVG, the Import SVG panel opens with the drawing loaded. Set the width and thickness, then click **Add** to extrude the drawing into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

Other files open this way:

- A URDF, MJCF or zip file (such as an exported Robot Package) comes in as a robot with its joints.
- A BVH motion file opens the retarget sheet for the selected robot.
- An image comes in as a reference image.
- A `.basecase` file opens in a new tab.

You can also open Import from **File** ▸ **Import** or with [[⌘K]]. To import files at a specific spot, drop them on the canvas there. If you drop a `.mid` file, Basecase doesn't import it. It plays the file in a Case's tries. To learn how, see [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Units and axes

Basecase reads each format in these units, with this up axis:

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

If a model is under 1 mm across, Basecase reads it as meters. Basecase doesn't simplify meshes, so your print keeps every triangle. FBX textures are skipped.

## STEP and IGES files

You can open STEP and IGES files in the desktop app. Each body in the file becomes its own part. The part takes its name from the file's product names and its color from the body's main face color. A file with more than one body comes in as a group of parts named after the file.

Basecase converts the file in a sandbox, separate from the rest of the app. It reads the units from the file, so every body comes in at its real size, in millimeters.

Like any other imported mesh, an imported body counts as a printed part. To mark a body as bought or machined, select it. Then under **Appearance**, change the material from **Printed PLA / PETG** to **Off-the-shelf** or **CNC aluminum**. After that, Checks lists it among parts without a source until you add one.

STEP and IGES files have these limits:

- A file can be up to 200 MB.
- A file can have up to 1,000 bodies.
- If the bodies add up to more than 200,000 triangles, Basecase simplifies the shapes to fit.
- Basecase stops converting after 2.5 minutes.

If a file doesn't import, see [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
