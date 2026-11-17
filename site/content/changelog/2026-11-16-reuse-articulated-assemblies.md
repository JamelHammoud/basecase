---
title: Reuse assemblies in Cases
date: 2026-11-16
image: /changelog/reuse-articulated-assemblies/cover.png
---

You can save a passive assembly and reuse it as a fixture in Cases. In the complete chest task, the robot opens the lid, places a block inside and closes the lid.

Select the assembly and choose **Save to Library**. In **New Case**, choose the saved **Fixture** alongside the task.

Opening the lid doesn't prove a robot can fill and close the chest. The composed task checks the whole sequence, including a lifted grasp and released placement. The robot fails if it doesn't open the lid far enough, drops the block or leaves the lid open.

You can choose from ten presets: lids, cupboards, drawers, doors, levers, knobs, spring buttons, bins, sliding gates and the complete chest chore. Each has a contact-driven reference. You keep the geometry, mounted frames, mass declarations, stops and springs when you save the assembly. You can edit placement and parameters in each Case without changing them in other Cases.

Physical-value tooltips distinguish supplied values from estimates. Seeded tries vary joint resistance and springs from 80% to 120% of their nominal values. Spring models use C MuJoCo when an accelerated backend can't represent them.

Fixtures need passive hinges or sliders with stops. You can't use closed loops or powered fixture joints. For printable geometry, use the existing scene export and printing paths. Simulation doesn't establish physical fit or measured force.

Steps are in [Reuse an assembly in Cases](/help/reuse-an-assembly-in-cases).
