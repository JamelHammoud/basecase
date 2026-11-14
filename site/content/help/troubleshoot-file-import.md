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

If you see a “Couldn’t import” toast after choosing a file, or a part comes in at the wrong size or lying on its side, find your symptom below.

## “Couldn’t import” after picking a STEP or IGES file

A toast that reads “Couldn’t import ⟨file⟩” means the file is too large or too complex for the built-in converter.

1. Make sure the file is under 200 MB.
2. In your CAD app, export only the part or subassembly you need, so the file has fewer than 1,000 bodies.
3. Import the smaller file again.
4. If it still doesn't import, export it from your CAD app as STL or 3MF, then import that file instead.

The converter gives up on a file after 2.5 minutes, and a detailed assembly can take that long.

## “Couldn’t import” after picking a mesh

Either Basecase doesn't read the file's format, or the file is damaged.

1. Make sure the file name ends in `.stl`, `.3mf`, `.obj`, `.ply`, `.fbx`, `.glb`, `.gltf` or `.dae`.
2. Open the file in the app it came from and export it again as STL or 3MF.
3. Import the new file.

## The part is far too big or too small

Basecase reads STL, 3MF, OBJ and PLY files in millimeters, so a file you saved in inches comes in 25.4 times too small.

1. Select the part.
2. In the Inspector, type its real size under **Size**.

Basecase also treats any mesh smaller than 1 mm across as meters and scales it up 1,000 times. To avoid both problems, export your files in millimeters.

## The part lies on its side

Basecase reads STL, 3MF and PLY files with Z pointing up, the way most CAD and print apps save them. If your app saved the file with Y up, the part arrives lying on its side.

1. Select the part.
2. In the Inspector, under **Rotation**, click **90°** under **X**.

## “Couldn’t import” right after you drop a file

A toast that appears as soon as you drop a file means Basecase doesn't read that file type. The web studio can't open STEP or IGES files.

1. Make sure the file name ends in one of the extensions listed above.
2. If it's a STEP or IGES file, open the scene in the desktop app instead.

Basecase brings in a `.mcap` file, or a zip that holds a LeRobot dataset, as tries rather than parts. If one of these doesn't import, the toast tells you what's wrong with it. See [Import robot data as tries](/help/import-robot-data-as-tries).

## How to tell it worked

After a successful import, Basecase selects the new part on the canvas and closes the “Importing” toast.
