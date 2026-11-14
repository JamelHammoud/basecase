---
title: Cut a part from sheet
date: 2026-11-14
collection: build-and-print
type: task
order: 9
covers:
  - src/sheet/detect.ts
  - src/sheet/materials.ts
  - src/sheet/sheetPatch.ts
  - src/sheet/dxf.ts
  - src/sheet/cutFiles.ts
  - src/components/inspector/MaterialFields.tsx
  - src/workspace/useSheetFit.ts
  - src/workspace/useCutFilesExport.ts
  - src/components/ExportMenu.tsx
---

Make a flat part from 6061 aluminum, carbon fiber plate or acrylic instead of printing it, and export the DXF a cutting service needs.

1. Select a flat part, such as a plate with through holes.
2. In the Inspector, under **Appearance**, set **Material** to **Cut from Sheet**.
3. In **Sheet**, choose **6061 aluminum**, **Carbon fiber plate** or **Acrylic**. Each option shows the stock thickness the part will have.
4. Click **Export** at the top right and choose **Cut Files**.

Or press [[⌘K]] and choose **Export Cut Files**.

**Cut from Sheet** appears only for a part that is flat: two parallel faces, holes that go all the way through, and straight sides between them. A part with a pocket, a counterbore, a chamfer or a boss can't be cut from sheet. The part's thinnest side must be 13.2 mm or less and at most half of each other side.

If the part's thickness isn't a stock size, it changes to the nearest one. A 2.9 mm plate becomes 3 mm. [[⌘Z]] puts it back as it was.

## What changes when a part is cut from sheet

- It leaves the print plates, and its filament leaves the bill of materials.
- The bill of materials lists it under **Sheet**, one line per material and thickness.
- Checks weighs it at the material's density: 2.7 g/cm³ for aluminum, 1.55 g/cm³ for carbon fiber and 1.19 g/cm³ for acrylic. Weight, Servo torque, Peak torque and the simulation all use that mass.

Cut Files downloads a zip with one DXF file for each sheet part, named after the part, its material and its thickness, such as `shin-plate-aluminum-3mm.dxf`. Each file is in millimeters, with the outline and each hole as a closed shape. Hidden parts are left out, and so is a sheet part that is no longer flat. The message after the export counts the parts left out.

A **Sheet** line has no list price. Upload the DXF files to a cutting service, then save its quote with **Add Price** on the line.

A part that an older scene marked as CNC aluminum or laser-cut sheet now counts as a sheet part.

For the parts you print, see [Print a robot's parts](/help/print-a-robots-parts).
