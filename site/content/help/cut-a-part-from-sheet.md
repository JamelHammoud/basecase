---
title: Cut a part from sheet
date: 2026-11-13
collection: build-and-print
type: task
order: 9
keywords:
  - aluminum
  - carbon fiber
  - acrylic
  - laser cut
  - waterjet
  - dxf
  - sendcutsend
covers:
  - src/sheet/detect.ts
  - src/sheet/materials.ts
  - src/sheet/dxf.ts
  - src/sheet/cutFiles.ts
  - src/components/inspector/types.ts
  - src/workspace/useCutFilesExport.ts
  - src/components/ExportMenu.tsx
---

Make a flat plate from aluminum, carbon fiber or acrylic instead of printing it, and save DXF files a laser or waterjet shop can cut.

A part qualifies when it has two parallel flat faces with only through holes and cutouts between them. A pocket, a chamfer or a fillet across the thickness rules it out. A part set to sheet that isn't flat gets no cut file and blocks Checks.

1. Select the flat part on the canvas.
2. In the Inspector, under **Appearance**, open the material menu.
3. Under **Cut from Sheet**, choose **6061 aluminum**, **Carbon fiber** or **Acrylic**.

![The Inspector with the chest plate set to 6061 aluminum, 3 mm](/help/cut-a-part-from-sheet/inspector.png)

Each choice shows the stock thickness the part is cut from. A drawn thickness snaps to the nearest stock size: 2.7 mm becomes 3 mm aluminum.

The part leaves the print plates and the filament count. Its weight uses the sheet's density, so Weight and Servo torque in Checks change with it. The **Bill of materials** lists it under **Sheet**, by material and thickness.

![The Bill of materials with a Sheet section listing 6061 aluminum, 3 mm](/help/cut-a-part-from-sheet/bill-of-materials.png)

To get the files for the shop:

1. Click **Export** at the top right.
2. Choose **Cut Files**.

![The Export menu with Cut Files](/help/cut-a-part-from-sheet/export-menu.png)

You can also press [[⌘K]] and choose **Export Cut Files**.

You get a zip with one DXF per sheet part, in millimeters. Each holds the outline and the holes as closed polylines, named by part, material and thickness, like `chest-plate-aluminum-6061-3mm.dxf`. Laser and waterjet shops such as SendCutSend take DXF files.

A sheet line has no list price, so save the shop's quote with **Add Price**. Basecase doesn't check the shop's rules for hole size or spacing.

To print the part again, choose **Printed PLA / PETG** in the same menu, or press [[⌘Z]]. To see what's left to fix before ordering, read [Checks and blockers](/help/checks-and-blockers).
