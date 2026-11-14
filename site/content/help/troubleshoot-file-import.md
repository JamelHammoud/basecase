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
covers:
  - src/workspace/usePartCreation.ts
  - src/workspace/meshImport.ts
  - src/workspace/cadImport.ts
  - src/workspace/importRoute.ts
  - electron/cadImport/convertPolicy.mjs
  - electron/cadImport/bodiesPolicy.mjs
---

If a file shows “Couldn’t import”, or comes in at the wrong size or lying on its side, find what you see below.

## “Couldn’t import” after picking a STEP or IGES file

If you see a toast that says “Couldn’t import ⟨file⟩”, the file is too large or too complex for the built-in converter.

1. Make sure the file is under 200 MB.
2. In your CAD app, export just the part or subassembly you need, so the file has fewer than 1,000 bodies.
3. Import the smaller file.
4. If it still doesn't import, export it from your CAD app as STL or 3MF and import that instead.

The converter stops working on a file after 2.5 minutes, which a detailed assembly can take.

## “Couldn’t import” after picking a mesh

Basecase either doesn't read the file's format, or the file is damaged.

1. Make sure the file ends in `.stl`, `.3mf`, `.obj`, `.ply`, `.fbx`, `.glb`, `.gltf` or `.dae`.
2. Open it in the app it came from and export it again as STL or 3MF.
3. Import the new file.

## The part is far too big or too small

Basecase reads STL, 3MF, OBJ and PLY files in millimeters. If you saved a file in inches, it comes in 25.4 times too small.

1. Select the part.
2. In the Inspector, type its real size under **Size**.

**Note:** Basecase treats a mesh under 1 mm across as meters and scales it up 1,000 times. To avoid both problems, export your files in millimeters.

## The part lies on its side

Basecase reads STL, 3MF and PLY files with Z pointing up, which is how most CAD and print apps save them. If your app saved a file with Y up, it arrives on its side.

1. Select the part.
2. Under **Rotation** in the Inspector, click **90°** under **X**.

## How to tell it worked

Once an import succeeds, Basecase closes the “Importing” toast and selects the new part on the canvas.

## “Couldn’t import” right after you drop a file

If the toast appears as soon as you drop a file, Basecase doesn't read that file type. The web studio can't open STEP or IGES files.

1. Make sure the file ends in one of the extensions listed above.
2. If it's a STEP or IGES file, open the scene in the desktop app.
