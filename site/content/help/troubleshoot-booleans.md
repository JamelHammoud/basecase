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

If a toast appears instead of a merged, cut or intersected part, or a cut went the wrong way, here's what to check.

## “Shift-click another part to combine”

Union and Intersect need two or more parts. This message means only one is selected.

1. Keep the first part selected.
2. Shift-click each part you want to combine with it.
3. Click **Union** or **Intersect** again.

## “Nothing to subtract. Overlap a Cutout or Shift-click a part.”

When one part is selected, Subtract cuts away every visible Cutout that overlaps it. This message means none of them do.

1. Move the shape you want to cut away so it overlaps the part.
2. Right-click that shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

**Note:** A hidden Cutout doesn't count. Show it in **Layers** first.

## “Those parts don’t overlap”

The parts don't share any volume, so there's nothing to merge, cut or keep.

1. Move the parts until they overlap. If you can't tell whether they do, measure with [[D]].
2. Run the command again.

## Subtract cut the wrong part

Subtract keeps the first part you selected and cuts the others out of it.

1. Press [[⌘Z]] to undo.
2. Click the part you want to keep, then Shift-click the others.
3. Click **Subtract**.

Before you click **Subtract**, hold the pointer over it. The tooltip names the part it will keep.

## How to tell it worked

A toast with Undo names the parts, for example **Subtracted Hole from Cube**. The result is selected as one part.
