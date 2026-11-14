---
title: Cut flat parts from aluminum, carbon fiber or acrylic
date: 2026-11-13
image: /changelog/cut-flat-parts-from-sheet/cover.png
---

You can now make a flat part from 6061 aluminum, carbon fiber or acrylic sheet instead of printing it. Its real mass reaches Checks, and Export ▸ Cut Files saves a DXF for each part.

A printed hip plate is often the first part to flex on a walking robot. Before, tagging a part CNC aluminum only listed it as needing a source, and Checks counted that as a blocker.

Basecase decides by geometry whether a part is flat: two parallel faces with only through holes between them. Those parts get a Cut from Sheet group in the Inspector's material menu. The thickness snaps to the nearest metric stock size, so a 2.7 mm aluminum plate becomes 3 mm.

A sheet part leaves the print plates. Its mass is the outline area times that thickness times the sheet's density: 2.7 g/cm³ for aluminum, 1.55 for carbon fiber, 1.19 for acrylic. Weight, Servo torque, Peak torque and the simulation all use it. The bill of materials lists it under Sheet.

Parts tagged CNC aluminum or Laser-cut sheet in older scenes now read as sheet. A part set to sheet that isn't flat stays a blocker in Checks.

Sheet lines have no price yet. Checks doesn't test the shop's rules for hole size and spacing, and bent parts aren't supported.

Steps are in [Cut a part from sheet](/help/cut-a-part-from-sheet).
