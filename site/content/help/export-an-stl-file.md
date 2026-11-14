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

Save the whole scene as one STL mesh, in millimeters, to open in a slicer or another CAD app.

1. Click **Export** at the top right of the window.
2. Choose **STL**.

![The Export menu with STL](/help/export-a-robot-package/menu.png)

Basecase saves a binary STL named after the scene. It holds every visible solid part, turned so Z points up, the way slicers expect. Hidden parts aren't in it.

**STL** turns on once the scene has a part. It's also **File** ▸ **Export STL**, and **Export STL** in [[⌘K]].

To print, **3MF Plates** in the same menu lays parts out on plates for your printer instead. Every format Basecase writes is in [Import and export formats](/help/import-and-export-formats).
