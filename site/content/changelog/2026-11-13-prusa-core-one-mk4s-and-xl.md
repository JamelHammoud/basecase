---
title: Prusa CORE One, MK4S and XL
date: 2026-11-13
image: /changelog/prusa-core-one-mk4s-and-xl/cover.png
---

You can now pick a Prusa CORE One, MK4S or XL in **Settings** ▸ **Printers**. Basecase lays your plates out on its bed and slices them with OrcaSlicer, using Prusa's own presets.

## What's new

Until now, the MINI was the only Prusa in the list. Now the CORE One, CORE One L, MK4, MK4S, MK3.5, MINI IS and XL are there too, along with their HF versions.

Each printer has its real build volume. The CORE One is 250 × 220 × 270 mm, the MK4S is 250 × 210 × 220 mm and the XL is 360 × 360 × 360 mm. Each one comes with its 0.4 mm nozzle profile, Prusa's quality presets for each layer height, and filament presets for PLA, PETG and TPU.

![**Settings** ▸ **Printers** with a Prusa CORE One sending through PrusaLink](/changelog/prusa-core-one-mk4s-and-xl/printers.png)

The list also matches Bambu Studio 2.9.1 now, which adds the Bambu Lab H3C.

## How slicing works for them

These printers come from OrcaSlicer's profiles, so Slice Plates and Send run OrcaSlicer for them, even if you have Bambu Studio installed. Bambu Lab printers still slice with Bambu Studio first.

Set PrusaLink as the connection, and Print Plate sends the sliced G-code straight to the printer.

Read [Add a printer](/help/add-a-printer) in the help center for the steps.

## What it doesn't do

The XL in the list is the single-tool version. The 5-tool XL, the CORE One INDX and printers with an MMU aren't there, because Basecase prints one material per plate.

PrusaSlicer's preset names don't match OrcaSlicer's, so Basecase doesn't use it for these printers.
