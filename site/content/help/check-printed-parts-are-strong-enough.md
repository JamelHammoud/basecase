---
title: Check printed parts are strong enough
date: 2026-11-13
covers:
  - src/utils/engineeringStrength.ts
  - src/strength/solve.ts
  - src/strength/material.ts
  - src/components/build/CheckItem.tsx
  - src/components/build/FindingRow.tsx
  - src/three/viewport/stressOverlay.ts
---

Find out whether each printed bracket between a servo and the next joint survives that joint's load, printed the way you'll print it.

1. Define the robot's joints and screw its printed parts to the servo horns. Strength only checks parts it can trace from a horn through screws.
2. Click Build at the top of the right panel.
3. Click Strength in Checks. Each part shows how many times its load it can carry, with the load and the joint: at 2× or more it passes, under 1.3× it fails.
4. Look at the canvas while Strength is open. Each checked part is coloured from blue, where it's relaxed, through amber to red, where it would crack first.
5. Click Fix beside a part to print it on the face where it's strongest. Strength checks it again on its own and turns green when it passes.

![Strength open with L Bracket at 1.2× under 0.77 N·m, and the bracket red at its bend](/help/check-printed-parts-are-strong-enough/strength-fails.png)

Layers stick to each other about half as well as plastic holds along a layer, so a bracket printed with its layers across a bend can split there on the first crouch. Turning it on its side often doubles what it can take.

![After Fix, Strength passes at 2.1× and the bend is blue](/help/check-printed-parts-are-strong-enough/strength-passes.png)

When no other face is clearly stronger, Fix hands the part to the agent instead, to thicken it or add a rib. Strength reads the part's material and your infill, so switching a part from PLA to PETG or raising the infill also changes its number.
