---
title: STEP or mesh file doesn't import
date: 2026-11-13
updated: 2026-11-14
collection: troubleshooting
type: troubleshooting
order: 1
keywords:
  - couldn't import
  - import failed
  - import error
  - step
  - iges
  - stl
  - wrong size
  - too small
  - too big
  - sideways
  - inches
  - units
related:
  - import-a-file
covers:
  - src/workspace/usePartCreation.ts
  - src/workspace/meshImport.ts
  - src/workspace/cadImport.ts
  - src/workspace/importRoute.ts
  - electron/cadImport/convertPolicy.mjs
  - electron/cadImport/bodiesPolicy.mjs
---

If a file shows “Couldn’t import”, or comes in at the wrong size or lying on its side, here’s what to check.

## “Couldn’t import” after picking a STEP or IGES file

If you see a toast that reads “Couldn’t import ⟨file⟩”, the file is too large or too complex for the built-in converter. The converter gives up on a file after 2.5 minutes, and a detailed assembly can take that long.

1. Make sure the file is under 200 MB.
2. In your CAD app, export only the part or subassembly you need, so the file has fewer than 1,000 bodies.
3. Import the smaller file again.
4. If it still fails, export it from your CAD app as STL or 3MF and import that instead.

## “Couldn’t import” after picking a mesh

Either Basecase can’t read the file’s format, or the file is damaged.

1. Make sure the file ends in `.stl`, `.3mf`, `.obj`, `.ply`, `.fbx`, `.glb`, `.gltf` or `.dae`.
2. Open it in the app it came from and export it again as STL or 3MF.
3. Import the new file.

## “Couldn’t import” right after you drop a file

If the toast appears as soon as you drop a file, Basecase doesn’t read that file type. The web studio can’t open STEP or IGES files.

1. Make sure the file ends in one of the extensions listed above.
2. If it’s a STEP or IGES file, open the scene in the desktop app.

A `.mcap` file, or a zip or folder that holds a LeRobot dataset, comes in as tries. If Basecase can’t read one of those, the message tells you what’s wrong with it. [Import robot data as tries](/help/import-robot-data-as-tries) lists what Basecase reads.

## The part is far too big or too small

Basecase reads STL, 3MF, OBJ and PLY files in millimeters. If you saved a file in inches, it comes in 25.4 times too small.

1. Select the part.
2. In the Inspector, type its real size under **Size**.

If a mesh is less than 1 mm across, Basecase assumes it’s in meters and scales it up 1,000 times. To avoid both problems, export your files in millimeters.

## The part lies on its side

Basecase reads STL, 3MF and PLY files with Z pointing up, which is how most CAD and print apps save them. If your app saved the file with Y up, the part comes in on its side.

1. Select the part.
2. Under **Rotation** in the Inspector, click **90°** under **X**.

## How to tell it worked

When an import succeeds, Basecase closes the “Importing” toast and selects the new part on the canvas.
