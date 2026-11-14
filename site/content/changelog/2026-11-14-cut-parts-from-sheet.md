---
title: Cut flat parts from sheet
date: 2026-11-14
image: /changelog/cut-parts-from-sheet/cover.png
---

You can now make flat robot parts from 6061 aluminum, carbon fiber plate or acrylic, with their mass in Checks and a DXF for cutting.

Select the part and choose Cut from Sheet in the Inspector's Manufacturing section. It works on basic shapes, sketches and agent-made parts whose geometry has two parallel faces and only through features.

A chest plate that changes from printed plastic to aluminum adds load to the legs. That change now reaches Weight, Servo torque, Peak torque and simulation through the same mass calculation.

The part snaps to a stock thickness and leaves the print plates and filament totals. The BOM groups it under Sheet by material and thickness. Cut Files in Export saves one DXF per sheet part in a zip, with outlines and holes as closed polylines in millimeters. The browser and desktop app use the same files.

Pockets and bends aren't supported. Shop limits, prices and press-in hardware aren't checked.

Steps are in [Cut parts from sheet](/help/cut-parts-from-sheet).
