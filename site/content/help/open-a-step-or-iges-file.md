---
title: Open a STEP or IGES file
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 14
keywords:
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
related:
  - import-a-mesh
  - troubleshoot-file-import
covers:
  - src/workspace/cadImport.ts
  - src/workspace/meshImport.ts
  - src/workspace/usePartCreation.ts
  - src/workspace/useCanvasDrop.ts
  - electron/cadImport/openCadFile.mjs
  - electron/cadImport/bodiesPolicy.mjs
  - electron/cadImport/convertPolicy.mjs
---

Bring a part or assembly from SolidWorks, Fusion, Onshape or a maker's website into the scene, one part per body, at true size.

Opening STEP and IGES works in the desktop app.

1. Right-click an empty spot on the canvas.
2. Choose **Import Mesh**.
3. Pick a `.step`, `.stp`, `.iges` or `.igs` file.

Each body in the file becomes its own part, named from the file's product names and colored with its main face color. A file with more than one body arrives as a group named after the file. The whole file stands on the spot you right-clicked.

You can also drop the file on the canvas, choose **File** ▸ **Import Mesh**, or press [[⌘K]] and choose **Import Mesh**.

## How the file is read

The file is converted in a sandbox, apart from the rest of the app. Units come from the file itself, so every body arrives in millimeters at its real size. Imported bodies count as printed parts, like any imported mesh.

To mark a body as bought or machined, select it. Then change the material under **Appearance** from **Printed PLA / PETG** to **Off-the-shelf** or **CNC aluminum**. Checks then list it among parts without a source until it has one.

## Limits

- Files up to 200 MB open.
- A file with more than 1,000 bodies doesn't open.
- Past 200,000 triangles in total, the shapes are simplified to fit.
- Conversion stops after 2.5 minutes.

A file that can't be read shows “Couldn’t import” with its name. [STEP or mesh file doesn't import](/help/troubleshoot-file-import) has the fixes.
