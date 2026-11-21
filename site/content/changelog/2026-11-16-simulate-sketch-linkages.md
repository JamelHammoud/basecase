---
title: Simulate Sketch linkages
date: 2026-11-16
image: /changelog/simulate-sketch-linkages/cover.png
---

You can simulate four-bars designed in Sketch, with a closing pin joining the coupler and rocker. The crank keeps its real servo.

Choose an animation in the Simulate tab to move the mechanism under physics. A walking-leg linkage needs its coupler to swing around both pins. Before this change, simulation fixed that bar to the crank and welded the rocker to the ground.

Each mechanism has two passive hinges and one closing-pin constraint. Its crank keeps the catalog limits and measured servo behavior. The passive bars have no holding motors.

Simulation stops with an error if you start with broken or singular geometry. You can use the existing Sketch four-bar format. Imported assembly constraints keep their existing behavior. Native policy training requires a floating robot, and accelerated Forge engines use the native fallback for these constraints.

Steps are in [Simulate a four-bar](/help/simulate-a-four-bar).
