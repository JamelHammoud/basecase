---
title: Prusa CORE One, MK4S and XL
date: 2026-11-13
image: /changelog/prusa-core-one-mk4s-and-xl/cover.png
---

Pick a Prusa CORE One, MK4S or XL in **Settings** ▸ **Printers**, and Basecase lays your plates out on its bed. It slices them with OrcaSlicer, using Prusa's own presets.

## What's new

Until now the only Prusa in the list was the MINI. The CORE One, CORE One L, MK4, MK4S, MK3.5, MINI IS and XL are there now, with their HF versions. Each has its real build volume. The CORE One is 250 × 220 × 270 mm, the MK4S 250 × 210 × 220 mm and the XL 360 × 360 × 360 mm. Each one comes with its 0.4 mm nozzle profile, Prusa's quality presets by layer height, and PLA, PETG and TPU filament presets.

![Settings ▸ Printers with a Prusa CORE One sending through PrusaLink](/changelog/prusa-core-one-mk4s-and-xl/printers.png)

The list also now matches Bambu Studio 2.9.1, which adds the Bambu Lab H3C.

## How slicing works for them

These printers come from OrcaSlicer's profiles, so Slice Plates and Send run OrcaSlicer for them, even if Bambu Studio is installed too. Bambu Lab printers still slice with Bambu Studio first. With PrusaLink set as the connection, Print Plate sends the sliced G-code straight to the printer. Steps are in [Add a printer](/help/add-a-printer).

## What it doesn't do

The XL is its single-tool version. The 5-tool XL, the CORE One INDX and printers with an MMU aren't in the list, since Basecase prints one material per plate. PrusaSlicer isn't used for these printers, because its preset names don't match OrcaSlicer's.
