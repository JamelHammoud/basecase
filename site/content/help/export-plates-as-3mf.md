---
title: Export plates as 3MF
date: 2026-11-13
updated: 2026-11-14
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

You can save your laid-out plates as 3MF files and slice them in any slicer. Basecase writes one file per material, with every part in its print orientation.

1. Click **Export** at the top right.
2. Choose **3MF Plates**.

![The Export menu with 3MF Plates under STL](/help/export-a-robot-package/menu.png)

You can also choose **Export 3MF Plates** from [[⌘K]].

The files save to your downloads. If the scene uses one material, you get `<scene>.3mf`. If it uses more than one, you get a file for each material, for example `robot-arm-PLA.3mf` and `robot-arm-PETG.3mf`.

In each file, the plates are named Plate 1, Plate 2, and so on, and they use the same layout as Bambu Studio. Parts keep their names and the orientation you chose in Print mode.

If you turn on **Label parts** in Print mode, Basecase cuts each part's build guide letter into a hidden face. See [Label printed parts with their guide letters](/help/label-printed-parts).

**3MF Plates** is available once the scene has a part to print, not counting parts set to **Don’t print**. If every part is too big for your printer's plate, Basecase tells you so and doesn't export. Export doesn't need a slicer, so it also works in the web studio.

If you'd rather slice and send from Basecase, see [Print a robot's parts](/help/print-a-robots-parts).
