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

Before you slice, Basecase works out which way each printed part sits, the support it needs, its walls, its time and its filament.

## How a part is turned

Each printed part tries the 6 ways its axes can point up, plus up to 6 large flat faces it could rest on. Basecase picks the one that prints best on your printer's bed, around any areas the bed keeps clear. A long part can go across the diagonal. If you chose a face with **Lay on Face**, that one wins.

## What it measures

- **Overhangs** are faces leaning more than 45° from upright.
- **Support** goes under faces within 30° of flat, the same threshold the stock slicer profiles use.
- **Thin walls** are found with rays shot inward through the part. A wall under 0.84 mm doesn't print.
- **Time** comes from the volume of plastic laid down.
- **Filament** is counted in grams per material, then rounded up to whole spools with 15% to spare.

A thin area of 100 mm² or more is a panel that would print with holes, and it blocks Ready to build. A smaller one is usually a thin edge from a cut, which the slicer drops, so it's only a note.

## From estimate to slice

Plates are packed per material, around the bed's clear areas. Parts the build guide needs first go on the first plates, and parts no step uses go last. Until a plate is sliced, its time and weight show with ≈. Once Bambu Studio or OrcaSlicer slices it, the plate shows the slicer's own time, grams, supports and warnings. The **Time** check in the Build tab adds up the same hours, with the slicer's time for each sliced plate.

## What Basecase won't print

A part meant to be clear, such as one named “Front Glass”, blocks the build. A printer can't make clear parts. A part bigger than the plate blocks it too. **Parts** in Print mode says how many pieces to split it into.

When a part is flagged, [A part is too big to print or has thin walls](/help/troubleshoot-build-part-wont-print) has the fixes.
