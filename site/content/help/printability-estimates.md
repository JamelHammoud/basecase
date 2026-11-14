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

Before you slice, Basecase works out how each printed part sits on the bed, how much support it needs and how thick its walls are. It also estimates how long each part takes to print and how much filament it uses.

## How a part is turned

For each printed part, Basecase tries the 6 ways its axes can point up, plus up to 6 large flat faces it could rest on. It picks the one that prints best on your printer's bed and works around any areas the bed keeps clear. Basecase can place a long part across the diagonal. If you chose a face with **Lay on Face**, Basecase uses that face.

## What it measures

- **Overhangs** are faces that lean more than 45° from upright.
- **Support** goes under faces within 30° of flat, the same threshold the stock slicer profiles use.
- **Thin walls** are walls thinner than 0.84 mm, which don't print. Basecase finds them by shooting rays inward through the part.
- **Time** comes from the volume of plastic laid down.
- **Filament** is counted in grams for each material, then rounded up to whole spools with 15% to spare.

A thin area of 100 mm² or more is a panel that would print with holes, so it blocks Ready to build. A smaller thin area is usually a thin edge left by a cut. The slicer drops those, so Basecase only shows a note.

## From estimate to slice

Basecase packs plates by material, around the bed's clear areas. Parts the build guide needs first go on the first plates, and parts that no step uses go last.

Until a plate is sliced, its time and weight show with ≈. Once Bambu Studio or OrcaSlicer slices the plate, it shows the slicer's own time, grams, supports and warnings.

## What Basecase won't print

A part that's meant to be clear, such as one named “Front Glass”, blocks the build, because a printer can't make clear parts. A part bigger than the plate also blocks the build. **Parts** in Print mode tells you how many pieces to split it into.

If Basecase flags a part, see [A part is too big to print or has thin walls](/help/troubleshoot-build-part-wont-print) for the fixes.
