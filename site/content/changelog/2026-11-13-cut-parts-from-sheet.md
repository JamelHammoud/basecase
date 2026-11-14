---
title: Cut flat parts from sheet
date: 2026-11-13
image: /changelog/cut-parts-from-sheet/cover.png
---

You can now cut a flat part from aluminum, carbon fiber or acrylic instead of printing it. Its real mass goes into Checks, and Export writes the DXF a cutting service takes.

Choose Cut from sheet as a flat part's material in the Inspector. Basecase decides what's flat from the geometry: two parallel faces with only through holes between them, 13 mm thick at most.

A PLA hip plate that flexes is often the first part to outgrow printing. Before this, tagging it CNC aluminum left it with no source, and Checks blocked the build. A plain plate with one of those tags now counts as sheet, so it stops blocking. A tagged part with a pocket or chamfer still needs a source.

Weight follows the metal. A 100 × 60 × 3 mm plate is 16.3 g printed in PLA at 20% infill and 48.6 g in 6061 aluminum. Servo torque and the simulation carry the same mass.

The thickness snaps to the nearest stock size, so 3 mm aluminum becomes 3.18 mm. The bill of materials lists sheet by material and thickness. **Export** ▸ **Cut Files** zips one DXF per part, in millimeters.

Bends, press-in hardware and the shop's rules on hole size aren't checked. Sheet has no list price, so add the price you see.

Steps are in [Cut a part from sheet](/help/cut-a-part-from-sheet).
