---
title: Snap parts together by their mounting holes
date: 2026-11-13
collection: design
type: task
covers:
  - src/agent/snap.ts
  - src/agent/portFit.ts
  - src/agent/mateFollow.ts
  - src/three/viewport/portSnap.ts
  - src/three/viewport/gizmo.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/dropPreview.ts
---

You can put a servo on a bracket, a board on a plate or a camera on its mount by their real holes, without lining parts up by eye or typing in positions.

1. Select the part and press [[V]] for Move. Or start dragging a part from Parts or the Library onto the canvas.
2. Drag it toward the part it mounts on. White dots appear on the holes, horns, bores and faces that fit each other. For example, the servo's horn fits a hole circle of the same size and thread, its output shaft fits a matching bore, and M2 holes fit M2 holes.
3. Bring a dot within about 8 mm of its partner. The pair turns blue and the part jumps into place, turned so the two line up.
4. Let go. The part stays mated. If you move the part it's mounted on, or the agent remodels that part, the mated part moves with it. To undo the snap and the mate together, press [[⌘Z]].

![A servo dragged toward a bracket, with dots on the ports that fit](/help/snap-parts-together-by-their-mounting-holes/near.png)

![The servo's horn snapped under the bracket's hole circle, the pair in blue](/help/snap-parts-together-by-their-mounting-holes/snapping.png)

![The servo mated to the bracket after letting go](/help/snap-parts-together-by-their-mounting-holes/mated.png)

To move a part without snapping, hold [[⌘]] while you drag.

To take a mated part off, drag it more than about 8 mm away from its partner. The part stays where you leave it and is no longer mated.

Screws, nuts and inserts don't snap. The agent's fasten places those.

The agent mates parts the same way, so a part you snap by hand lands in the same place the agent's `mate` would put it.
