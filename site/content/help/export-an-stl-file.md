---
title: Export an STL file
date: 2026-11-13
updated: 2026-11-14
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

You can export your whole scene as a single STL mesh in millimeters, then open it in a slicer or another CAD app.

1. Click **Export** at the top right of the window.
2. Choose **STL**.

![The Export menu with STL](/help/export-a-robot-package/menu.png)

Basecase saves a binary STL file with the same name as your scene. The file includes every visible solid part, rotated so that Z points up the way slicers expect. Hidden parts aren't included.

**Note:** **STL** is available once your scene has a visible Solid part.

You can also choose **File** ▸ **Export STL**, or press [[⌘K]] and choose **Export STL**.

If you're exporting to print, choose **3MF Plates** from the same menu instead. It lays out your parts on plates for your printer. For a list of every format Basecase writes, see [Import and export formats](/help/import-and-export-formats).
