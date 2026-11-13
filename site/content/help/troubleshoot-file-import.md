---
title: STEP or mesh file doesn't import
date: 2026-11-13
updated: 2026-11-13
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
  - open-a-step-or-iges-file
covers:
  - src/workspace/usePartCreation.ts
  - src/workspace/meshImport.ts
  - src/workspace/cadImport.ts
  - src/workspace/importRoute.ts
  - electron/cadImport/convertPolicy.mjs
  - electron/cadImport/bodiesPolicy.mjs
---

Fix a file that shows “Couldn’t import”, or comes in at the wrong size or lying on its side.

## “Couldn’t import” after picking a STEP or IGES file

The toast reads “Couldn’t import ⟨file⟩”. The file is too large or too complex for the built-in converter.

1. Check that the file is under 200 MB.
2. In your CAD app, export only the part or subassembly you need, so the file has fewer than 1,000 bodies.
3. Import the smaller file again.
4. If it still fails, export it from your CAD app as STL or 3MF and import that.

The converter also stops after 2.5 minutes on one file, which a very detailed assembly can reach.

## “Couldn’t import” after picking a mesh

The file is in a format Basecase doesn't read, or it's damaged.

1. Check that the file ends in `.stl`, `.3mf`, `.obj`, `.ply`, `.fbx`, `.glb`, `.gltf` or `.dae`.
2. Open it in the app it came from and export it again as STL or 3MF.
3. Import the new file.

## The part is far too big or too small

STL, 3MF, OBJ and PLY files are read as millimeters. A file saved in inches comes in 25.4 times too small.

1. Select the part.
2. In the Inspector, type its real size under **Size**.

A mesh under 1 mm across is read as meters and scaled up 1,000 times. To avoid both, export in millimeters.

## The part lies on its side

STL, 3MF and PLY are read with Z pointing up, the way most CAD and print apps save them. A file saved with Y up arrives on its side.

1. Select the part.
2. Under **Rotation** in the Inspector, click **90°** under **X**.

## How to tell it worked

A toast says “Inserted” with the part's name, and the new part is selected on the canvas.

## “Couldn’t import” right after you drop a file

Basecase doesn't read that kind of file. The web studio doesn't read STEP and IGES files either.

1. Check the file ends in one of the extensions above.
2. For STEP or IGES, open the scene in the desktop app.
