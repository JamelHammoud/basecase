---
title: Cut parts from aluminum, carbon fiber or acrylic sheet
date: 2026-11-14
---

You can now make a flat part from 6061 aluminum, carbon fiber plate or acrylic instead of printing it, and export DXF files to have it cut.

A printed hip or chest plate is often the first part to flex on a walking robot. Until now, marking it as aluminum made Checks list it as a part with no source, and the robot could never be ready to build.

Select a flat part and set its Material to Cut from Sheet in the Inspector. Basecase decides from the shape alone: two parallel faces, through holes only, straight sides. The thickness snaps to the nearest stock size, from 0.8 mm to 12.7 mm for aluminum.

The part leaves the print plates. Checks weighs it at 2.7 g/cm³ for aluminum, so Weight, Servo torque and the simulation feel the metal. The bill of materials lists it under Sheet by material and thickness. **Export** ▸ **Cut Files** downloads one DXF per part, in millimeters.

Sheet parts have no list price, and bends aren't supported. Parts that older scenes marked as CNC aluminum or laser-cut sheet now count as sheet parts and no longer block.

Steps are in [Cut a part from sheet](/help/cut-a-part-from-sheet).
