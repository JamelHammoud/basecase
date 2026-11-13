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

Move, resize or turn the part that made a hole, and the cut in the result follows.

Start from a part cut with **Subtract**, as in [Cut, join and intersect parts](/help/cut-join-and-intersect-parts). In Layers, the parts it was made from sit under it, the first part on top.

![Layers with Servo Mount, and Servo Mount, Servo Pocket and Cable Hole nested under it](/help/edit-a-cut/result.png)

1. Double-click a hole on the canvas, or ⌘-click it, to select the part that cut it. Clicking its row in Layers does the same. It shows over the result, with the gizmo on it.

![The Cable Hole selected inside the plate, drawn in red with the gizmo on it](/help/edit-a-cut/drilled.png)

2. Move it with the gizmo or the Position fields, or change its Size or Rotation. The cut moves with it, and ⌘Z undoes each change on its own.

![The Servo Pocket moved 8 mm to the left, with the pocket in the plate following it](/help/edit-a-cut/moved.png)

Click the result once to select the whole part again, the same way you'd leave a group. Moving it carries the parts inside it along.
