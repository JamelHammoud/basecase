---
title: Cut flat parts from sheet
date: 2026-11-14
image: /changelog/cut-flat-parts-from-sheet/cover.png
---

You can now have a flat part cut from 6061 aluminum, carbon fiber plate or acrylic, and export its DXF for a cutting service.

Select a flat part and set its **Material** in the Inspector to **Cut from Sheet**. **Cut Files** in the **Export** menu writes one DXF per sheet part into a zip.

A walking robot's printed hip and chest plates are often the first parts to flex. Before, marking a part as aluminum or laser-cut made Checks call it a part with no source, and Weight guessed its mass. Now the part leaves the print plates and weighs what its material weighs. A 100 by 60 mm plate with four holes, 3 mm thick, is 48.3 g in aluminum. Weight, Servo torque and the simulation all use that number.

The bill of materials lists the part under **Sheet** by material and thickness. The thickness snaps to the nearest stock size, so 3 mm becomes 3.18 mm aluminum.

Basecase decides what's flat from the shape alone: two parallel faces with only through cuts between them. Old scenes with parts marked CNC aluminum or laser-cut sheet open as Cut from Sheet and no longer block Checks. Bends and checks against a shop's cutting rules aren't there.

Steps are in [Cut a flat part from sheet](/help/cut-a-flat-part-from-sheet).
