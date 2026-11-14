---
title: Export an STL file
date: 2026-11-13
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 7
keywords:
  - stl
  - download model
  - mesh
  - 3d print
  - slicer
  - fusion
  - blender
  - usdz
  - airdrop
related:
  - import-and-export-formats
  - get-a-robot-ready-to-build
covers:
  - src/components/ExportMenu.tsx
  - src/workspace/useExportActions.ts
  - src/three/analysis/sceneStl.ts
  - src/workspace/exchangeCommands.tsx
---

You can save your whole scene as a single STL mesh, in millimeters, and open it in a slicer or another CAD app.

1. Click **Export** at the top right of the window.
2. Choose **STL**.

![The Export menu with STL](/help/export-a-robot-package/menu.png)

Basecase saves a binary STL file named after the scene. The file includes every visible solid part, rotated so that Z points up, the way slicers expect. Hidden parts are left out.

**STL** is available once the scene has a part. You can also choose **File** ▸ **Export STL**, or use **Export STL** in [[⌘K]].

If you're exporting to print, use **3MF Plates** in the same menu instead. It lays parts out on plates for your printer. For every format Basecase writes, see [Import and export formats](/help/import-and-export-formats).
