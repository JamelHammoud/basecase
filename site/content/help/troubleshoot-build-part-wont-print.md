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
  - src/print/labels/partLetters.ts
  - src/components/inspector/types.ts
---

The Printing check flags parts that your printer can't make as drawn. It measures each part against the printer you chose in Print mode. If you chose **Made by a Service**, the check uses the printer you chose before that.

## “This part is too big for your printer’s plate.”

The part is bigger than your printer's bed every way it could lie, including across the diagonal.

1. Press [[⌘P]] to open Print mode.
2. Under **Printer**, make sure **Printer** shows the printer you'll use. A printer with a larger bed may fit the part.
3. Open **Parts** and find the part's row. It tells you how many pieces to split the part into.
4. In the Build tab, click **Fix** on the problem. The agent splits the part into pieces that join with dowels or screws.

After the fix, the part sits on a plate, and **Printing** in Checks no longer shows a red mark.

## “This part has a wall too thin to print, so it would come out with holes.”

A wall on this part is thinner than 0.84 mm over an area of 100 mm² or more.

1. Click the part name under the problem to select it.
2. Make the wall at least 0.84 mm thick, or click **Fix** to have the agent do it.

## “A thin edge here may not print cleanly. It’s usually fine.”

Checks lists this as a note. The part has a sliver less than 0.84 mm thick, usually left by a cut that grazes a face. The slicer drops the sliver, so the part prints without it.

## “This part needs a lot of support material to print.”

Some faces are close to flat and hang over air, so they need support under them. This is also a note.

1. Press [[⌘P]], select the part, then click **Lay on Face**.
2. Click a face that leaves less of the part hanging in the air.
3. If that isn't enough, add 45° chamfers under the overhangs, or split the part flat.

## “This part is meant to be clear, which a printer can’t make.”

The part is set to print, but its name ends in a word like Glass, or its note starts with clear acrylic.

1. Select the part.
2. In the Inspector, set **Material** to **Cut from Sheet**, then set **Sheet** to **Acrylic**.
3. If the part isn't flat, you can't choose **Cut from Sheet**. Set **Material** to **Off-the-shelf** instead. **Real parts** then asks where to get it. To leave that to the agent, click **Fix**.

## “Letter ⟨letter⟩ left off: no flat face is hidden, free and big enough”

This note appears in **Parts** in Print mode, next to the part's build guide letter. **Label parts** is on, but every flat face of this part shows from outside, touches another part, rests on the bed, or is too small. There's nowhere to put the letter, so the part prints plain.

1. Select the part and click **Lay on Face** to rest it on a different face. The face it rested on before may then take the letter.
2. To print the part plain, select it and turn on **Don't label**.

## “Letter ⟨letter⟩ left off: its mesh has open edges”

The part's mesh has gaps, so Basecase can't cut the letter into it, and the part prints plain. Close the gaps in the part, or turn on **Don't label** for it.

## The plate shows warnings after slicing

The amber lines on a sliced plate come from the slicer. Do what they say, then slice again with **Slice Plates** in [[⌘K]].
