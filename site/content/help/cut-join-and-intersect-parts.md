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

You can merge parts into one solid, cut one part out of another, or keep only the volume two parts share.

## Join or intersect two parts

1. Select the parts on the canvas. To add each part after the first, Shift-click it.
2. In the Inspector, under **Combine**, click **Union** to merge the parts, or click **Intersect** to keep only the volume they share.

The parts become one mesh, named after the first part you selected and printed in that part's material. A toast with Undo names the parts, for example **Merged Sphere into Cube**.

## Cut one part out of another

1. Click the part you want to keep.
2. Shift-click the parts you want to cut out of it.
3. In the Inspector, under **Combine**, click **Subtract**.

The first part keeps its name and material. In **Layers**, the parts you cut out appear under it.

**Subtract** always cuts from the first part you selected, and its tooltip names that part.

## Cut holes with Cutouts

1. Overlap a shape with the part where you want the hole.
2. Right-click the shape and choose **Cutout**.
3. Right-click the part and choose **Subtract Overlapping Cutouts**.

Every visible Cutout that overlaps the part is cut out of it in one step.

- **Hole** and **Slot** in [[⌘K]] start as Cutouts, so you can skip step 2.
- **Guide**, next to **Cutout** in the menu, keeps a part as a reference that's never printed.
- Cutouts and Guides are never built, so neither one has a **Material** under **Appearance**.

When several parts are selected, you can also find **Union**, **Subtract** and **Intersect** in the right-click menu and in [[⌘K]]. If one of them shows an error, see [Union, Subtract or Intersect shows an error](/help/troubleshoot-booleans).

Print mode can also join printed parts that are bolted together and drop their screws. See [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).
