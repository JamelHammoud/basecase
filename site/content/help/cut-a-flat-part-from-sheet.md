---
title: Cut a flat part from sheet
date: 2026-11-14
collection: build-and-print
type: task
order: 9
keywords:
  - dxf
  - aluminum
  - carbon fiber
  - acrylic
  - laser cut
  - waterjet
  - sendcutsend
covers:
  - src/sheet/detect.ts
  - src/sheet/dxf.ts
  - src/sheet/materials.ts
  - src/components/inspector/MaterialFields.tsx
  - src/workspace/useCutFilesExport.ts
  - src/components/ExportMenu.tsx
  - src/workspace/exchangeCommands.tsx
---

Have a flat plate cut from aluminum, carbon fiber or acrylic instead of printing it, and export a DXF file a cutting service can quote.

1. Select a flat part, like a plate with holes.
2. In the Inspector, under **Appearance**, set **Material** to **Cut from Sheet**.
3. In the menu below it, choose 6061 aluminum, carbon fiber plate or acrylic.
4. Click **Export** at the top right and choose **Cut Files**.
5. Upload each DXF file in the zip to a cutting service such as SendCutSend.

![The Inspector with Material set to Cut from Sheet and the sheet set to 6061 aluminum 3.18 mm](/help/cut-a-flat-part-from-sheet/inspector.png)

Or press [[⌘K]] and choose **Export Cut Files**.

![The Export menu with Cut Files](/help/cut-a-flat-part-from-sheet/export-menu.png)

**Cut from Sheet** shows only for a flat part. A part is flat when two parallel faces cover its whole outline and everything between them goes straight through, like holes, slots and the outline itself. A pocket, a step, a chamfer or a countersink makes it not flat. The part must be 20 mm thick or less, and at least twice as wide as it is thick. Basic shapes, sketches, cuts and parts the agent made all count, as long as their shape is flat.

The thickness snaps to the nearest size the material is sold in. A 3 mm plate becomes 3.18 mm aluminum, 3 mm carbon fiber or 3 mm acrylic. The sizes come from SendCutSend's stock:

| Material | Thicknesses in mm |
|---|---|
| 6061 aluminum | 1.02, 1.6, 2.03, 2.54, 3.18, 4.75, 6.35, 7.95, 9.53, 12.7, 15.88, 19.05 |
| Carbon fiber plate | 1.02, 1.6, 2.01, 3, 3.99, 5, 8 |
| Acrylic | 1.6, 3, 4.5, 5.4, 9.5, 12.7 |

A part cut from sheet leaves the print plates and the filament count. Weight, Servo torque and the simulation weigh it at its material's density: 2.7 g/cm³ for aluminum, 1.55 for carbon fiber and 1.19 for acrylic. The bill of materials lists it under **Sheet**, one line per material and thickness. A line has no price until you add one.

![The bill of materials with a Sheet line for 6061 aluminum, 3.18 mm](/help/cut-a-flat-part-from-sheet/bill-of-materials.png)

Each DXF file holds one part in millimeters, its outline and every hole as closed polylines. Round holes come out as the straight segments the part is drawn with. The file is named after the part, the material and the thickness, like `Shin-Plate-6061-aluminum-3.18mm.dxf`. A part marked Cut from Sheet that isn't flat any more is left out, and a message says how many parts were left out.

The thickness is set when you choose the material. If you change how thick the part is, choose the material again. Bends aren't supported, so a bracket made of one bent sheet still prints.

To print the part again, set **Material** back to **Printed PLA / PETG**.
