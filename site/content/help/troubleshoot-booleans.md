---
title: Union, Subtract or Intersect shows an error
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 2
keywords:
  - boolean
  - boolean failed
  - nothing to subtract
  - don't overlap
  - union error
  - subtract error
  - cutout
  - csg
related:
  - cut-join-and-intersect-parts
  - group-parts
covers:
  - src/workspace/useSelectionOps.ts
  - src/booleans/evaluate.ts
---

Fix the toast that appears instead of a merged, cut or intersected part, or a cut that went the wrong way.

## “Shift-click another part to combine”

Union and Intersect need two or more parts, and only one is selected.

1. Keep the first part selected.
2. Shift-click each part to combine with it.
3. Click **Union** or **Intersect** again.

## “Nothing to subtract. Overlap a Cutout or Shift-click a part.”

With one part selected, Subtract cuts away every visible Cutout that overlaps it, and none does.

1. Move the shape you want to cut away so it overlaps the part.
2. Right-click that shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

A hidden Cutout doesn't count. Show it in **Layers** first.

## “Those parts don’t overlap”

The parts don't share any volume, so there's nothing to merge, cut or keep.

1. Move the parts until they overlap. Measure with [[D]] if you can't tell.
2. Run the command again.

## “Select a part first”

Nothing is selected, or only reference images are. Reference images are never used in Union, Subtract or Intersect. Select a solid part and try again.

## Subtract cut the wrong part

Subtract keeps the first part you selected and cuts the others out of it.

1. Press [[⌘Z]] to undo.
2. Click the part you want to keep, then Shift-click the others.
3. Click **Subtract**.

The tooltip on **Subtract** names the part it keeps, so you can check before you click.

## How to tell it worked

A toast says **Merged**, **Subtracted** or **Intersected** with Undo, and the result is selected as one part.
