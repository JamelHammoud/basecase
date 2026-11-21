---
title: Rehearse an arm at a workbench
date: 2026-11-20
image: /changelog/rehearse-at-a-workbench/cover.png
---

You can now rehearse an arm Case in simulation at a workbench placement you enter, then save that placement for a named unit.

Open an existing arm Case and expand **Workbench placement** in **Simulate**. Enter the unit name, base datum in millimeters and upright rotation in degrees.

You can keep a drawer fixed and place the arm at another spot on the bench. Rehearse that layout with the drawer's dimensions and resistance intact.

You get a reach check for every supported target. MuJoCo runs the complete Cartesian reference, and you get a verdict on the physical outcome under the original Case contract. Static-fixture contacts can cause a refusal if the placement is obstructed.

You save completed placements with the scene and can undo them. If you change the Case, robot geometry, tool binding or placement, you invalidate the previous verdict. If you cancel, you keep the prior placement.

You enter placements as evidence. You cannot use them to establish physical registration accuracy or transfer performance. You cannot use this workflow for pitch, roll, joint-space references or physical execution.

Follow the steps in [Rehearse an arm at a workbench](/help/rehearse-an-arm-at-a-workbench).
