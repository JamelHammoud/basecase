---
title: A part is too big to print or has thin walls
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 3
keywords:
  - won't fit
  - build plate
  - bed size
  - thin wall
  - holes in print
  - supports
  - overhang
  - clear acrylic
related:
  - printability-estimates
  - print-a-robots-parts
  - troubleshoot-build-slicing-fails
covers:
  - src/readiness/wording.ts
  - src/readiness/buildChecks.ts
  - src/utils/printReport.ts
  - src/three/printability.ts
  - src/components/print/PrintedSection.tsx
  - src/components/inspector/types.ts
---

The Printing check flags parts your printer can't make as drawn, measured against the printer chosen in Print mode.

## “This part is too big for your printer’s plate.”

The part is larger than your printer's bed in every way it could lie, the diagonal included.

1. Press ⌘P to open Print mode.
2. Under **Printer**, check that **Printer** names the printer you'll use. A larger bed may fit the part.
3. Open **Parts** and read the part's row. It says how many pieces to split the part into.
4. Click **Fix** on the problem in the Build tab to have the agent split it, joined with dowels or screws.

It worked when the part sits on a plate and **Printing** in Checks shows no red mark.

## “This part has a wall too thin to print, so it would come out with holes.”

A wall is under 0.84 mm thick over 100 mm² or more.

1. Click the part name under the problem to select it.
2. Thicken the wall to at least 0.84 mm, or click **Fix** to have the agent do it.

## “A thin edge here may not print cleanly. It’s usually fine.”

This is a note. A small sliver, usually from a cut that grazes a face, is under 0.84 mm thick. The slicer drops it, so the part prints without it.

## “This part needs a lot of support material to print.”

This is a note. Faces close to flat hang over air and need support under them.

1. Press ⌘P, select the part and click **Lay on Face**.
2. Click a face that leaves less hanging in the air.
3. If that's not enough, add 45° chamfers under the overhangs, or split the part flat.

## “This part is meant to be clear, which a printer can’t make.”

The part's name ends in a word like Glass, or its note starts with clear acrylic, and it's set to print.

1. Select the part.
2. In the Inspector's **Appearance** section, set the material menu to **Laser-cut sheet** or **Off-the-shelf**.
3. Source the sheet, since **Real parts** then asks where to get it. **Fix** hands that to the agent.

## The plate shows warnings after slicing

The amber lines on a sliced plate come from the slicer itself. Follow what they say, then slice again with **Slice Plates** in ⌘K.
