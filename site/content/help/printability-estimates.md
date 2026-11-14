---
title: Printability estimates
date: 2026-11-13
updated: 2026-11-13
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
covers:
  - src/three/printability.ts
  - src/utils/printReport.ts
  - src/print/
  - src/readiness/wording.ts
---

Before you slice, Basecase works out how each printed part should sit on the bed, how much support it needs, and whether its walls are thick enough. It also estimates how long each part takes to print and how much filament it uses.

## How a part is turned

Basecase tries each printed part in the 6 ways its axes can point up, plus resting on up to 6 of its large flat faces. It picks the one that prints best on your printer's bed and avoids the bed's clear areas. A long part can lie across the bed's diagonal.

If you chose a face with **Lay on Face**, Basecase rests the part on that face.

## What it measures

- **Overhangs** are faces that lean more than 45° from upright.
- **Support** goes under faces within 30° of flat, the same threshold the stock slicer profiles use.
- **Thin walls** are walls under 0.84 mm thick, which don't print. Basecase finds them by shooting rays inward through the part.
- **Time** comes from the volume of plastic the printer lays down.
- **Filament** is counted in grams for each material, then rounded up to whole spools with 15% to spare.

A thin area of 100 mm² or more is a panel that would print with holes in it, so it blocks Ready to build. Smaller thin areas tend to be edges left behind by a cut. The slicer drops those, so Basecase shows a note and doesn't block.

## From estimate to slice

Basecase packs plates by material, avoiding the bed's clear areas. Parts the build guide needs first go on the first plates, and parts no step uses go on the last ones.

An unsliced plate shows its time and weight with ≈. Once Bambu Studio or OrcaSlicer slices the plate, it shows the slicer's own time, grams, supports, and warnings.

## What Basecase won't print

A printer can't make clear parts, so a part meant to be clear, such as one named “Front Glass”, blocks the build.

A part bigger than the plate also blocks the build, and **Parts** in Print mode tells you how many pieces to split it into.

For fixes to a flagged part, see [A part is too big to print or has thin walls](/help/troubleshoot-build-part-wont-print).
