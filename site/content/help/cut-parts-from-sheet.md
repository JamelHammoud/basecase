---
title: Cut parts from sheet
date: 2026-11-14
collection: build-and-print
type: task
covers:
  - src/components/inspector/ManufacturingSection.tsx
  - src/sheet/materials.ts
  - src/sheet/cutFiles.ts
  - src/workspace/useCutFileExport.ts
---

Choose aluminum, carbon fiber or acrylic for a flat part, then export its outline and holes for cutting.

1. On the canvas, select a flat solid part with only through holes.
2. In the Inspector's **Manufacturing** section, choose **Cut from Sheet**.
3. Under **Material**, choose the sheet material.
4. Under **Thickness**, choose a stock size.

![The Inspector showing an aluminum chest plate and its stock thickness](/help/cut-parts-from-sheet/material.png)

5. At the top right, click **Export**.
6. Choose **Cut Files** to save the zip.

![The Export menu with Cut Files available for the chest plate](/help/cut-parts-from-sheet/export.png)

Or press [[⌘K]] and choose **Cut Files**.

Choosing a material snaps the part's thickness to the nearest available stock size and resizes the solid.
Use **Thickness** in **Manufacturing** to change it. Size fields that would change sheet thickness are disabled.
The part leaves the print plates and filament totals.
Checks and simulation use its volume and the sheet material's density for mass and torque.
The BOM lists sheet parts by material and thickness under **Sheet**.

The zip contains one DXF per sheet part, named for the part, material and thickness.
Outlines and holes are closed polylines in millimeters.
Cut files work in the desktop app and the browser.

Parts with pockets, bends or beveled faces can't use this process.
Shop limits, prices and press-in hardware aren't checked.

To return a part to the print plates, in **Manufacturing**, choose **3D Print**.
The part keeps its current dimensions.
Changing its shape also returns it to printing.
An older CNC or laser-cut part that no longer qualifies keeps **Manufacturing** so you can choose **3D Print**.

Continue with [Build checks](/help/build-checks).
