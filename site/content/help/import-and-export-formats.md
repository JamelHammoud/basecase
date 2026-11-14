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
  - src/utils/robotImport/readModel.ts
  - src/utils/robotImport/archive.ts
  - electron/cadImport/convertPolicy.mjs
  - src/utils/sceneFile.ts
---

Every file type Basecase opens and saves, with the units it assumes and its size limits.

## Import

| Format | How it comes in | Units Basecase assumes |
|---|---|---|
| STL, 3MF, PLY | [Import a file](/help/import-a-file), as one part per file | Millimeters, Z up |
| OBJ | Import a mesh | Millimeters, Y up |
| GLB, glTF, DAE | Import a mesh | Meters |
| FBX | Import a mesh | Centimeters |
| STEP, STP, IGES, IGS | Import a mesh, in the desktop app only | The file's own units |
| SVG | [Draw a part from a sketch or SVG](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part) | The width you type |
| URDF, MJCF, zip | [Import a robot](/help/import-a-robot), with its joints | The file's own units |
| `.basecase` | [Open a shared scene](/help/open-a-shared-scene) | — |
| PNG, JPEG and other images | Dropped on the canvas, as a flat reference image | — |
| BVH | **File** ▸ **Import**, as motion for a robot with joints, or to [design a robot from it](/help/design-a-robot-from-a-motion) | The height you type |

A mesh that comes in smaller than 1 mm across is read as meters and scaled up 1,000 times.

## Limits

- A STEP or IGES file can be up to 200 MB and 1,000 bodies.
- A robot zip can be up to 200 MB to download, and 600 MB once unzipped.

## Export

Every export is in the **Export** menu at the top right of the window.

| Menu item | File | What's in it |
|---|---|---|
| **Image** | `<scene>.png` | The canvas as you see it, without the grid, gizmos and other helpers |
| **STL** | `<scene>.stl` | Every visible solid part as one binary mesh, in millimeters, Z up |
| **3MF Plates** | `<scene>.3mf`, or one file per material | The printed parts laid out on plates, each with its [guide letter](/help/label-printed-parts) while **Label parts** is on |
| **Scene** | `<scene>.basecase` | The scene, to open in Basecase |
| **Robot Package** | `<scene>-robot.zip` | MJCF, URDF, meshes, joint map, policies and ROS 2 package files, listed in [Robot package contents](/help/robot-package-contents) |
| **Copy as Markdown** | The clipboard | The scene as a Markdown spec: its goal and every part with its size |
| **AirDrop** on a Mac, **USDZ Model** on Windows | `<scene>.usdz` | The solid parts as a USDZ model, which an iPhone or iPad opens in 3D |

File names use the scene's name in lowercase, with dashes for spaces.
