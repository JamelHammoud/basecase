---
title: Edit a cut after you make it
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
covers:
  - src/workspace/useSelectionOps.ts
  - src/booleans/picking.ts
  - src/booleans/operands.ts
  - src/components/layers/layerRows.ts
---

After you cut a hole, you can move, resize, or rotate the part that made it, and the cut in the result follows.

You need a part you cut with **Subtract**, as in [Cut, join and intersect parts](/help/cut-join-and-intersect-parts). In Layers, you'll find the parts you made it from nested under it, with the first part on top.

![Layers with Servo Mount, and Servo Mount, Servo Pocket and Cable Hole nested under it](/help/edit-a-cut/result.png)

1. To select the part that cut a hole, double-click the hole on the canvas, [[⌘]]-click it, or click its row in Layers. The part appears over the result with the gizmo on it.

![The Cable Hole selected inside the plate, drawn in red with the gizmo on it](/help/edit-a-cut/drilled.png)

2. Move the part with the gizmo or the Position fields, or change its Size or Rotation. The cut moves with it. Each change is its own step, so [[⌘Z]] undoes them one at a time.

![The Servo Pocket moved 8 mm to the left, with the pocket in the plate following it](/help/edit-a-cut/moved.png)

To select the whole part, click the result once, the same way you leave a group. When you move the result, the parts inside it move with it.
