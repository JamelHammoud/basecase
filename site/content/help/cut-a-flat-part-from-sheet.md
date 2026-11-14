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

Instead of printing a flat plate, you can have it cut from aluminum, carbon fiber or acrylic. Basecase exports a DXF file that a cutting service can quote.

1. Select a flat part, like a plate with holes.
2. In the Inspector, under **Appearance**, set **Material** to **Cut from sheet**.
3. In the menu below it, choose 6061 aluminum, carbon fiber plate or acrylic.
4. Click **Export** at the top right and choose **Cut Files**.
5. Upload each DXF file in the zip to a cutting service such as SendCutSend.

![The Inspector with Material set to Cut from sheet and the sheet set to 6061 aluminum 3.18 mm](/help/cut-a-flat-part-from-sheet/inspector.png)

You can also press [[⌘K]] and choose **Export Cut Files**.

![The Export menu with Cut Files](/help/cut-a-flat-part-from-sheet/export-menu.png)

## Which parts can be cut from sheet

**Cut from sheet** appears only for flat parts. A part is flat when two parallel faces cover its whole outline and everything between them goes straight through, such as holes, slots and the outline itself. If the part has a pocket, a step, a chamfer or a countersink, it isn't flat.

The part must also be:

- 20 mm thick or less
- At least twice as wide as it is thick

Basic shapes, sketches, cuts and parts the agent made all count, as long as their shape is flat.

## Sheet thicknesses

The thickness snaps to the nearest size the material is sold in. For example, a 3 mm plate becomes 3.18 mm aluminum, 3 mm carbon fiber or 3 mm acrylic. The sizes come from SendCutSend's stock:

| Material | Thicknesses in mm |
|---|---|
| 6061 aluminum | 1.02, 1.6, 2.03, 2.54, 3.18, 4.75, 6.35, 7.95, 9.53, 12.7, 15.88, 19.05 |
| Carbon fiber plate | 1.02, 1.6, 2.01, 3, 3.99, 5, 8 |
| Acrylic | 1.6, 3, 4.5, 5.4, 9.5, 12.7 |

## How a sheet part changes your build

A part cut from sheet doesn't go on the print plates or count toward filament. Weight, Servo torque and the simulation weigh it at its material's density:

- Aluminum: 2.7 g/cm³
- Carbon fiber: 1.55 g/cm³
- Acrylic: 1.19 g/cm³

The bill of materials lists the part under **Sheet**, with one line for each material and thickness. A line has no price until you add one.

![The bill of materials with a Sheet line for 6061 aluminum, 3.18 mm](/help/cut-a-flat-part-from-sheet/bill-of-materials.png)

## What's in the cut files

Each DXF file holds one part, in millimeters. The part's outline and every hole are saved as closed polylines. Round holes come out as the straight segments the part is drawn with.

Basecase names each file after the part, the material and the thickness, like `Shin-Plate-6061-aluminum-3.18mm.dxf`.

If a part marked Cut from sheet is no longer flat, Basecase leaves it out of the export, and a message tells you how many parts were left out. Checks blocks Ready to build on that part until it's flat again or printed.

## Things to keep in mind

- Basecase sets the thickness when you choose the material. If you change how thick the part is, choose the material again.
- Sheet parts can't have bends, so a bracket made from one bent sheet still prints.

## Print the part again

Set **Material** back to **Printed PLA / PETG**.
