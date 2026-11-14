---
title: Union, Subtract or Intersect shows an error
date: 2026-11-13
updated: 2026-11-14
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
  - src/booleans/stretch.ts
---

If Union, Subtract or Intersect shows a toast instead of a merged, cut or intersected part, find its message below. There are also sections for a cut that went the wrong way and a combined part that won't resize.

## “Shift-click another part to combine”

Union and Intersect need at least two parts. You see this message when you have only one part selected.

1. Keep the first part selected.
2. Shift-click each part you want to combine with it.
3. Click **Union** or **Intersect** again.

## “Nothing to subtract. Overlap a Cutout or Shift-click a part.”

If you select one part, Subtract cuts away every visible Cutout that overlaps it. You see this message when no Cutout overlaps the part.

1. Move the shape you want to cut away so that it overlaps the part.
2. Right-click that shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

**Note:** Subtract skips hidden Cutouts. If the Cutout is hidden, show it in **Layers** first.

## “Those parts don’t overlap”

The parts share no volume, so Basecase has nothing to merge, cut or keep.

1. Move the parts until they overlap. If you aren't sure whether they do, measure with [[D]].
2. Run the command again.

## Subtract cut the wrong part

Subtract keeps the first part you selected and cuts the other parts out of it.

1. Press [[⌘Z]] to undo.
2. Click the part you want to keep, then Shift-click the others.
3. Click **Subtract**.

To check which part Subtract will keep before you cut, hold the pointer over **Subtract**. The tooltip names that part.

## A Size field is grayed out

Some parts keep a fixed shape: catalog parts and hardware keep their real size, and a tube or torus stays round. If one of these parts sets the outer edge of a combined part along an axis, you can't stretch the combined part along that axis. The line under **Size** names the part that's holding it.

1. In **Layers**, click the named part under the combined part.
2. Move it in from the edge, or change its own size.

When that part no longer reaches the edge, you can edit the field again. A screw or tube boss that sits inside the combined part, clear of the edge, doesn't lock the field.

## How to tell it worked

You'll see a toast with Undo that names the parts, for example **Subtracted Hole from Cube**. Basecase then selects the result as a single part.
