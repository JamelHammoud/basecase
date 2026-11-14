---
title: Cut flat parts from sheet
date: 2026-11-14
image: /changelog/cut-flat-parts-from-sheet/cover.png
---

You can now have a flat part cut from 6061 aluminum, carbon fiber plate or acrylic, and export its DXF for a cutting service.

Select a flat part and, in the Inspector, set its **Material** to **Cut from sheet**. Then choose **Cut Files** in the **Export** menu. It writes one DXF per sheet part into a zip.

On a walking robot, the printed hip and chest plates are often the first parts to flex. Until now, if you marked a part as aluminum or laser-cut, Checks called it a part with no source and Weight guessed its mass. Now the part comes off the print plates, and Weight takes its mass from its material.

## What It Weighs

A 100 by 60 mm plate with four holes, 3 mm thick, is 48.3 g in aluminum. Weight, Servo torque and the simulation all use that number.

The bill of materials lists the part under **Sheet**, by material and thickness. The thickness snaps to the nearest stock size, so 3 mm becomes 3.18 mm aluminum.

## What Counts as Flat

Basecase decides what's flat from the shape alone: two parallel faces with only through cuts between them. Checks blocks a sheet part only when its shape isn't flat.

Old scenes with parts marked CNC aluminum or laser-cut sheet open as Cut from sheet.

Basecase doesn't do bends, and it doesn't check a part against a shop's cutting rules.

Read [Cut a flat part from sheet](/help/cut-a-flat-part-from-sheet) in the help center for the steps.
