---
title: Check printed parts are strong enough
date: 2026-11-13
collection: engineer
type: task
covers:
  - src/utils/engineeringStrength.ts
  - src/strength/solve.ts
  - src/strength/material.ts
  - src/components/build/CheckItem.tsx
  - src/components/build/FindingRow.tsx
  - src/three/viewport/stressOverlay.ts
---

Strength tells you whether each printed bracket between a servo and the next joint survives that joint's load, printed the way you'll print it.

1. Define the robot's joints, then screw its printed parts to the servo horns. Strength only checks parts it can trace from a horn through screws.
2. Click Build at the top of the right panel.
3. In Checks, click Strength. Each part shows its joint, the load on it, and how many times over it can carry that load. A part passes at 2× or more and fails under 1.3×.
4. Keep Strength open and look at the canvas. Strength colors each checked part from blue where it's relaxed, through amber, to red where it would crack first.
5. To print a part on the face where it's strongest, click Fix beside it. Strength checks that part again on its own and turns green when it passes.

![Strength open with L Bracket at 1.2× under 0.77 N·m, and the bracket red at its bend](/help/check-printed-parts-are-strong-enough/strength-fails.png)

Layers stick to each other about half as well as plastic holds together along a layer. A bracket printed with its layers across a bend can split there the first time the robot crouches. Turning it on its side often doubles what it can take.

![After Fix, Strength passes at 2.1× and the bend is blue](/help/check-printed-parts-are-strong-enough/strength-passes.png)

If no other face is clearly stronger, Fix sends the part to the agent instead, to thicken it or add a rib. Strength reads the part's material and your infill, so switching a part from PLA to PETG or raising the infill also changes its number.
