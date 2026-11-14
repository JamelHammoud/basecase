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

You can save the laid-out plates as 3MF files and slice them in any slicer. Basecase saves one file per material, and each part is already in its print orientation.

1. Click **Export** at the top right.
2. Choose **3MF Plates**.

![The Export menu with 3MF Plates under STL](/help/export-a-robot-package/menu.png)

Basecase saves the files to your downloads. If the scene uses one material, the file is named `<scene>.3mf`. If it uses several, each material gets its own file, such as `robot-arm-PLA.3mf` and `robot-arm-PETG.3mf`.

Inside each file, the plates are named Plate 1, Plate 2, and so on, and they're laid out the way Bambu Studio lays out plates. Parts keep their names and the orientation you chose in Print mode.

If **Label parts** is on in Print mode, each part has its build guide letter cut into a hidden face. To learn more, see [Label printed parts with their guide letters](/help/label-printed-parts).

You can also choose **Export 3MF Plates** from [[⌘K]]. It works in the web studio too, because it doesn't need a slicer.

To slice and send from Basecase instead, see [Print a robot's parts](/help/print-a-robots-parts).
