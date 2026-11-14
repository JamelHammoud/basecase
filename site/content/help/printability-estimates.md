---
title: Printability estimates
date: 2026-11-13
updated: 2026-11-14
collection: build-and-print
type: concept
order: 3
keywords:
  - overhang
  - supports
  - orientation
  - wall thickness
  - print time
  - filament weight
  - fdm
related:
  - print-a-robots-parts
  - troubleshoot-build-part-wont-print
  - build-checks
  - price-printed-parts-from-a-print-service
covers:
  - src/three/printability.ts
  - src/utils/printReport.ts
  - src/print/
  - src/readiness/wording.ts
---

Before you slice, Basecase estimates how each printed part should sit on the bed, how much support it needs, how thick its walls are, how long it takes to print, and how much filament it uses.

## How a part is turned

Basecase tries each printed part in the 6 ways its axes can point up, plus up to 6 large flat faces it could rest on. Then it picks the orientation that prints best on your printer's bed, keeping the part out of the bed's clear areas. A long part can go across the bed's diagonal.

If you chose a face with **Lay on Face**, Basecase uses that face.

## What it measures

- **Overhangs** are faces that lean more than 45° from upright.
- **Support** goes under faces within 30° of flat. That's the same threshold the stock slicer profiles use.
- **Thin walls** are walls thinner than 0.84 mm, which won't print. Basecase finds them by casting rays inward through the part.
- **Time** comes from the volume of plastic the printer lays down.
- **Filament** is counted in grams for each material, then rounded up to whole spools with 15% extra. If you choose **Made by a Service**, the bill of materials lists each part's quote instead.

A thin area of 100 mm² or more is a panel that would print with holes in it, so it blocks Ready to build. A smaller thin area tends to be a thin edge that a cut left behind. The slicer drops those edges, and Basecase shows the area as a note.

## From estimate to slice

Basecase packs plates by material and keeps parts out of the bed's clear areas. Parts the build guide needs first go on the first plates, and parts no step uses go on the last ones.

Until you slice a plate, Basecase marks its time and weight with ≈. After Bambu Studio or OrcaSlicer slices it, the plate shows the slicer's own time, grams, supports and warnings.

## What Basecase won't print

A printer can't make clear parts, so a part meant to be clear, such as one named “Front Glass”, blocks the build. A part bigger than the plate also blocks it, and **Parts** in Print mode tells you how many pieces to split it into.

Basecase doesn't print a part whose **Material** is **Cut from sheet**. That part gets no estimate and no plate. See [Cut a flat part from sheet](/help/cut-a-flat-part-from-sheet).

If Basecase flags a part, [A part is too big to print or has thin walls](/help/troubleshoot-build-part-wont-print) explains how to fix it.
