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

If Union, Subtract or Intersect shows a toast instead of a combined part, cuts the wrong way, or leaves a combined part you can't resize, find the section below that matches what you see.

## “Shift-click another part to combine”

Union and Intersect need at least two parts, and you have only one selected.

1. Keep the first part selected.
2. Shift-click each part you want to combine with it.
3. Click **Union** or **Intersect** again.

## “Nothing to subtract. Overlap a Cutout or Shift-click a part.”

With a single part selected, Subtract cuts away every visible Cutout that overlaps it. You see this message when no visible Cutout overlaps the part.

1. Move the shape you want to cut away so it overlaps the part.
2. Right-click that shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

**Note:** Subtract skips hidden Cutouts. Show a hidden Cutout in **Layers** before you subtract.

## “Those parts don’t overlap”

The parts share no volume, so there's nothing to merge, cut or keep.

1. Move the parts until they overlap. If you aren't sure they do, measure with [[D]].
2. Run the command again.

## Subtract cut the wrong part

Subtract keeps the first part you selected and cuts the others out of it.

1. Press [[⌘Z]] to undo.
2. Click the part you want to keep, then Shift-click the others.
3. Click **Subtract**.

To check which part Subtract keeps, hold the pointer over **Subtract** before you click it. Its tooltip names that part.

## A Size field is grayed out

Some parts have a fixed shape: catalog parts and hardware keep their real size, and a tube or torus stays round. If one of these parts sets the outer edge of a combined part along an axis, you can't stretch the combined part along that axis. The line under **Size** names the part that's holding it.

1. In **Layers**, click the named part under the combined part.
2. Move it in from the edge, or change its own size if it's hardware, a tube or a torus.

Once that part no longer reaches the edge, you can edit the field again. A screw or tube boss that sits inside the combined part, clear of the edge, doesn't lock the field.

## How to tell it worked

When a command works, a toast with Undo names the parts, for example **Subtracted Hole from Cube**. Basecase selects the result as one part.
