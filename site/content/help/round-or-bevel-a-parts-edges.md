---
title: Round or bevel a part's edges
date: 2026-11-13
updated: 2026-11-14
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

You can fillet or chamfer every edge of a basic shape by a size in millimeters. Rounded or beveled edges make a printed bracket stronger and more comfortable to hold.

1. Select a box, cube, cylinder, tube, hex prism or wedge in the canvas or in **Layers**.
2. In the Inspector, click **Shape** to open it.
3. Click **Fillet** to round the edges, or click **Chamfer** to bevel them.
4. Type the size in mm in the field next to it, then press [[↩]].

![The Shape section with Fillet chosen and the size at 4 mm](/help/round-or-bevel-a-parts-edges/fillet.png)

The part keeps its size. Fillet and Chamfer cut its edges and corners inward, so it still fits where it did before.

![A 60 × 12 × 40 mm plate with 4 mm fillets on every edge, beside a chamfered spacer](/help/round-or-bevel-a-parts-edges/filleted.png)

The size can't reach half of the part's smallest side. If you type a larger number, the size stops at 98% of that. For example, on a plate that's 12 mm thick, the largest size is 5.88 mm. On some shapes, the size works differently:

- On a tube, the wall sets the limit.
- On a hex prism or wedge, the limit is the largest circle that fits inside its outline.
- On an oval cylinder, the size holds across its width and scales by depth ÷ width along its depth.

To make the edges sharp again, set the size to 0. Or press [[⌘Z]] to undo.

Taper, Bend and Twist still work on a part with rounded edges. But a rounded or beveled plate isn't flat anymore, so it can't be [cut from sheet](/help/cut-a-flat-part-from-sheet).

You can also ask the agent to fillet or chamfer a part. For example: “Round the edges by 3 mm.” The agent sets the same field.

A part from an older scene may show **Round** instead. Round is a percentage that pulls the shape toward an ellipsoid. It stays on the part until you set it to 0.

Only basic shapes have Fillet and Chamfer. Parts the agent models round their edges in their own code. In a STEP file, a part with rounded edges arrives as a faceted solid.

To cut holes or slots in the shape next, see [Cut, join and intersect parts](/help/cut-join-and-intersect-parts).
