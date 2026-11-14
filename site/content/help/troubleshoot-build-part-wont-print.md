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

The Printing check flags parts that your printer can't make as drawn. It measures each part against the printer you chose in Print mode. If you've chosen **Made by a Service**, the check uses the printer you chose before that.

## “This part is too big for your printer’s plate.”

The part is larger than your printer's bed in every way it could lie, including across the diagonal.

1. Press [[⌘P]] to open Print mode.
2. Under **Printer**, make sure **Printer** shows the printer you'll use. A printer with a larger bed may fit the part.
3. Open **Parts** and find the part's row. It tells you how many pieces to split the part into.
4. In the Build tab, click **Fix** on the problem. The agent splits the part into pieces that join with dowels or screws.

You'll know it worked when the part sits on a plate and **Printing** in Checks no longer shows a red mark.

## “This part has a wall too thin to print, so it would come out with holes.”

A wall on this part is less than 0.84 mm thick over an area of 100 mm² or more.

1. Click the part name under the problem to select it.
2. Thicken the wall to at least 0.84 mm. Or click **Fix** and the agent does it for you.

## “A thin edge here may not print cleanly. It’s usually fine.”

This is a note. The part has a small sliver less than 0.84 mm thick, usually left by a cut that grazes a face. The slicer drops the sliver, and the part prints without it.

## “This part needs a lot of support material to print.”

This is a note. Some faces are close to flat and hang over air, so they need support under them.

1. Press [[⌘P]], select the part, then click **Lay on Face**.
2. Click a face that leaves less of the part hanging in the air.
3. If that isn't enough, add 45° chamfers under the overhangs, or split the part flat.

## “This part is meant to be clear, which a printer can’t make.”

The part is set to print, but its name ends in a word like Glass, or its note starts with clear acrylic.

1. Select the part.
2. In the Inspector, set **Material** to **Cut from Sheet**, then choose acrylic in the menu below it. Basecase offers **Cut from Sheet** only for flat parts. If the part isn't flat, set it to **Off-the-shelf** instead.
3. For a sheet part, click **Export** and choose **Cut Files**, then send the DXF to a cutting service. For an off-the-shelf part, **Real parts** asks where to get it, and **Fix** hands that job to the agent.

## “Letter ⟨letter⟩ left off: no flat face is hidden, free and big enough”

You'll see this note in **Parts** in Print mode, next to the part's build guide letter. It means that with **Label parts** on, every flat face of this part shows from outside, touches another part, rests on the bed, or is too small. The letter has nowhere to go, so the part prints plain.

1. Select the part and click **Lay on Face** to rest it on a different face. The face it rested on before may then take the letter.
2. To print the part plain on purpose, select it and turn on **Don't label**.

## “Letter ⟨letter⟩ left off: its mesh has open edges”

The part's mesh has gaps, so Basecase can't cut the letter into it, and the part prints plain. Close the gaps in the part, or turn on **Don't label** for it.

## The plate shows warnings after slicing

The amber lines on a sliced plate come from the slicer, not from Basecase. Follow what they say, then slice again with **Slice Plates** in [[⌘K]].
