---
title: Edit a cut after you make it
date: 2026-11-13
collection: design
type: task
covers:
  - src/workspace/useSelectionOps.ts
  - src/booleans/picking.ts
  - src/booleans/operands.ts
  - src/components/layers/layerRows.ts
---

Cut pockets and holes with Subtract, then move, resize or turn the part that made a hole, and the cut follows.

1. Place a Cutout, or any part, where the hole goes, overlapping the part you're cutting.
2. Select the part to keep. Shift-click the parts to cut with, or leave it alone and Subtract uses every visible Cutout that overlaps it.
3. Press ⌘K and choose Subtract. It's also in the right-click menu and under Combine in the Inspector, next to Union and Intersect, which work the same way.

![A plate selected, with a red Servo Pocket and Cable Hole overlapping it](/help/edit-a-cut/before.png)

The result keeps the plate's name. In Layers, the parts it was made from sit under it, the plate first.

![Layers with Servo Mount, and Servo Mount, Servo Pocket and Cable Hole nested under it](/help/edit-a-cut/result.png)

4. Double-click a hole on the canvas, or ⌘-click it, to select the part that cut it. Clicking its row in Layers does the same. It shows over the result, with the gizmo on it.

![The Cable Hole selected inside the plate, drawn in red with the gizmo on it](/help/edit-a-cut/drilled.png)

5. Move it with the gizmo or the Position fields, or change its Size or Rotation. The cut moves with it, and ⌘Z undoes each change on its own.

![The Servo Pocket moved 8 mm to the left, with the pocket in the plate following it](/help/edit-a-cut/moved.png)

Click the result once to select the whole part again, the same way you'd leave a group. Moving it carries the parts inside it along.
