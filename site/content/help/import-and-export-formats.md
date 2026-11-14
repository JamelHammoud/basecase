---
title: Import and export formats
date: 2026-11-13
updated: 2026-11-13
collection: files-and-sharing
type: reference
order: 1
keywords:
  - file types
  - supported formats
  - stl
  - step
  - obj
  - 3mf
  - urdf
  - mjcf
  - usdz
  - glb
  - units
related:
  - import-a-file
  - export-an-stl-file
covers:
  - src/workspace/meshImport.ts
  - src/components/ExportMenu.tsx
  - src/workspace/useExportActions.ts
  - src/workspace/useStepExport.ts
  - src/utils/robotImport/readModel.ts
  - src/utils/robotImport/archive.ts
  - electron/cadImport/convertPolicy.mjs
  - src/utils/sceneFile.ts
---

Basecase can open and save the file types below. For each one, the tables show the units Basecase assumes. STEP, IGES and robot zip files also have a size limit.

## Import

| Format | How to bring it in | Units Basecase assumes |
|---|---|---|
| STL, 3MF, PLY | [Import a file](/help/import-a-file). Each file comes in as one part. | Millimeters, Z up |
| OBJ | Import a mesh | Millimeters, Y up |
| GLB, glTF, DAE | Import a mesh | Meters |
| FBX | Import a mesh | Centimeters |
| STEP, STP, IGES, IGS | Import a mesh. Desktop app only. | The file's own units |
| SVG | [Draw a part from a sketch or SVG](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part) | The width you type |
| URDF, MJCF, zip | [Import a robot](/help/import-a-robot). The robot comes in with its joints. | The file's own units |
| `.basecase` | [Open a shared scene](/help/open-a-shared-scene) | |
| PNG, JPEG and other images | Drop the image on the canvas. It comes in as a flat reference image. | |
| BVH | Choose **File** ▸ **Import**. It comes in as motion for a robot with joints. | |

If a mesh comes in smaller than 1 mm across, Basecase reads it as meters and scales it up 1,000 times.

## Limits

- A STEP or IGES file can be up to 200 MB, with up to 1,000 bodies.
- A robot zip can be up to 200 MB to download, and up to 600 MB once it's unzipped.

## Export

You'll find every export in the **Export** menu at the top right of the window.

| Menu item | File | What's in it |
|---|---|---|
| **Image** | `<scene>.png` | The canvas as you see it, without the grid, gizmos or other helpers |
| **STL** | `<scene>.stl` | Every visible solid part as one binary mesh, in millimeters, Z up |
| **3MF Plates** | `<scene>.3mf`, or one file per material | The printed parts laid out on plates. While **Label parts** is on, each part has its [guide letter](/help/label-printed-parts). |
| **STEP** (desktop app only) | `<scene>.step` | Every visible solid part as its own body, in millimeters, Z up. See [Export a STEP file](/help/export-a-step-file). |
| **Scene** | `<scene>.basecase` | The scene, ready to open in Basecase |
| **Robot Package** | `<scene>-robot.zip` | MJCF, URDF, meshes, the joint map, policies and ROS 2 package files. For the full list, see [Robot package contents](/help/robot-package-contents). |
| **Copy as Markdown** | The clipboard | The scene as a Markdown spec, with its goal and every part and its size |
| **AirDrop** on a Mac, **USDZ Model** on Windows | `<scene>.usdz` | The solid parts as a USDZ model, which you can open in 3D on an iPhone or iPad |

Basecase names each exported file after the scene, in lowercase, with dashes in place of spaces.
