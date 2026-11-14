---
title: Export plates as 3MF
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 6
keywords:
  - 3mf
  - slicer
  - prusaslicer
  - cura
  - export plates
  - stl
related:
  - print-a-robots-parts
  - add-a-printer
  - troubleshoot-build-slicing-fails
  - label-printed-parts
covers:
  - src/components/ExportMenu.tsx
  - src/workspace/useExportActions.ts
  - src/workspace/sceneCommands.tsx
  - src/print/threeMf.ts
  - src/print/job.ts
---

Save the laid-out plates as 3MF files to slice in any slicer, one file per material, with each part already turned to print.

1. Click **Export** at the top right.
2. Choose **3MF Plates**.

![The Export menu with 3MF Plates under STL](/help/export-a-robot-package/menu.png)

Basecase saves the files to your downloads. With one material it's `<scene>.3mf`. With several, each material gets its own file, such as `robot-arm-PLA.3mf` and `robot-arm-PETG.3mf`.

Inside, each plate is named Plate 1, Plate 2 and so on, laid out the way Bambu Studio lays out plates. Parts keep their names and the orientation chosen in Print mode. With **Label parts** on in Print mode, each part has its build guide letter cut into a hidden face, as [Label printed parts with their guide letters](/help/label-printed-parts) explains.

**Export 3MF Plates** is also in ⌘K. It works in the web studio too, since it needs no slicer.

To slice and send from Basecase instead, see [Print a robot's parts](/help/print-a-robots-parts).
