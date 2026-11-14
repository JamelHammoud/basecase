---
title: Import a file
date: 2026-11-12
updated: 2026-11-14
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
  - mcap
  - lerobot
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

Use Import to bring files from other apps into your scene. The one command opens every file type Basecase reads, and each type comes in its own way.

1. Right-click an empty spot on the canvas.
2. Choose **Import**.
3. Pick one or more files.

![The canvas menu with Import](/help/import-a-file/menu.png)

You can also choose **File** ▸ **Import**, or press [[⌘K]].

Meshes and CAD files become parts. Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE files, and the desktop app also reads STEP, STP, IGES and IGS files. New parts appear where you right-clicked, and they're selected so you can move them.

If you pick an SVG, the Import SVG panel opens with your drawing loaded. Set the width and thickness, then click **Add** to extrude the drawing into a part.

![The Import SVG panel with a drawing loaded](/help/import-a-file/svg.png)

Other files come in like this:

- A URDF, MJCF or zip file (such as an exported Robot Package) comes in as a robot with its joints.
- A BVH motion file opens the retarget sheet for the selected robot.
- An image comes in as a reference image.
- A `.basecase` file opens in a new tab.
- A `.mcap` recording, or a zip that holds a LeRobot dataset, comes in as tries on the robot in the scene. See [Import robot data as tries](/help/import-robot-data-as-tries).

To import files at a specific spot, drop them on the canvas. If you drop a `.mid` file, it plays in a Case's tries instead. See [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Units and axes

Basecase reads each format with these units and up axis:

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

If a model measures less than 1 mm across, Basecase reads it as meters instead. Basecase never simplifies a mesh, so your print keeps every triangle in the file.

**Note:** FBX textures don't come in with the model.

## STEP and IGES files

You can open STEP and IGES files in the desktop app. Each body in the file becomes its own part. Basecase names each part from the file's product names and colors it with the body's main face color. If the file has more than one body, the parts come in as a group named after the file.

Basecase converts the file in a sandbox, separate from the rest of the app. It reads the units from the file, so every body comes in at its real size in millimeters.

An imported body counts as a printed part, like any other imported mesh. To mark a body as bought:

1. Select the body.
2. Under **Appearance**, change the material from **Printed PLA / PETG** to **Off-the-shelf**.

Checks lists the body among parts without a source until you give it one. A flat body can be **Cut from sheet** instead. See [Cut a flat part from sheet](/help/cut-a-flat-part-from-sheet).

STEP and IGES files have these limits:

- A file can be up to 200 MB.
- A file can have up to 1,000 bodies.
- If the bodies add up to more than 200,000 triangles, Basecase simplifies the shapes to fit.
- Basecase stops converting after 2.5 minutes.

If a file doesn't import, see [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
