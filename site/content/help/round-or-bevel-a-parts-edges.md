---
title: Round or bevel a part's edges
date: 2026-11-13
collection: design
type: task
order: 18
keywords:
  - fillet
  - chamfer
  - round
  - bevel
  - radius
covers:
  - src/components/inspector/EdgesField.tsx
  - src/components/inspector/partTransformSections.tsx
  - src/utils/partEdges.ts
  - src/three/partMesh/edgedGeometry.ts
  - src/three/partMesh/edgedProfile.ts
---

Fillet or chamfer every edge of a basic shape by a size in millimeters, so a printed bracket is stronger and kinder to hold.

1. Select a box, cube, cylinder, tube, hex prism or wedge, in the canvas or in **Layers**.
2. In the Inspector, click **Shape** to open it.
3. Click **Fillet** to round the edges, or **Chamfer** to bevel them.
4. Type the size in mm in the field beside it, and press [[↩]].

![The Shape section with Fillet chosen and the size at 4 mm](/help/round-or-bevel-a-parts-edges/fillet.png)

The part keeps its size. Its edges and corners are cut inward, so it still fits where it did.

![A 60 × 12 × 40 mm plate with 4 mm fillets on every edge, beside a chamfered spacer](/help/round-or-bevel-a-parts-edges/filleted.png)

The size can't reach half the part's smallest side. A larger number stops at 98% of that: 5.88 mm on a plate 12 mm thick. On a tube the wall sets the limit, and on a hex prism or wedge the largest circle inside its outline. On an oval cylinder, the size holds across its width and scales by depth ÷ width along its depth. Set the size to 0 to make the edges sharp again, or press [[⌘Z]] to undo.

Taper, Bend and Twist still work on a part with rounded edges. You can also ask the agent, as in “Round the edges by 3 mm”, and it sets the same field.

A part from an older scene may show **Round**, a percentage that pulls the shape toward an ellipsoid. It stays until you set it to 0.

A part [cut from sheet](/help/cut-a-part-from-sheet) isn't flat once its edges are rounded, so Checks blocks it.

Only basic shapes have Fillet and Chamfer. Parts the agent models round their edges in their own code. In a STEP file, a part with rounded edges arrives as a faceted solid.

To cut holes or slots in the shape next, see [Cut, join and intersect parts](/help/cut-join-and-intersect-parts).
