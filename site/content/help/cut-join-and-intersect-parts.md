---
title: Cut, join and intersect parts
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 4
keywords:
  - boolean
  - booleans
  - csg
  - union
  - subtract
  - intersect
  - merge
  - combine
  - cutout
  - hole
  - difference
related:
  - parts-assemblies-and-mounting-ports
  - troubleshoot-booleans
  - merge-printed-parts-into-one-print
covers:
  - src/workspace/useSelectionOps.ts
  - src/components/inspector/MultiInspector.tsx
  - src/workspace/contextMenuItems.tsx
  - src/workspace/editCommands.tsx
---

Merge parts into one solid, cut one part out of another, or keep only the volume two parts share.

## Join or intersect two parts

1. Select the parts on the canvas. Shift-click adds each one after the first.
2. Under **Combine** in the Inspector, click **Union** to merge them, or **Intersect** to keep only the volume they share.

The parts become one mesh, named after the first part you selected and printed in its material. A toast with Undo names the parts, as in **Merged Sphere into Cube**.

## Cut one part out of another

1. Click the part you want to keep.
2. Shift-click the parts to cut out of it.
3. Click **Subtract** under **Combine** in the Inspector.

The first part keeps its name and material, and the parts cut from it sit under it in **Layers**. **Subtract** always cuts from the first part you selected; its tooltip names that part.

## Cut holes with Cutouts

1. Overlap a shape with the part where the hole should go.
2. Right-click the shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

Every visible Cutout that overlaps the part is cut out of it in one step. **Hole** and **Slot**, in [[⌘K]], start as Cutouts, so they skip step 2. **Guide**, beside **Cutout** in the menu, keeps a part as a reference that's never printed. A Cutout or Guide has no **Material** under **Appearance**, since nothing builds it.

**Union**, **Subtract** and **Intersect** are also in the right-click menu and [[⌘K]] while several parts are selected. If one shows an error instead, see [Union, Subtract or Intersect shows an error](/help/troubleshoot-booleans).

Print mode can also join printed parts that are bolted together, and drop their screws, as in [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).
