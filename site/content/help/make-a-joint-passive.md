---
title: Make a joint passive
date: 2026-11-15
collection: simulate-and-train
type: task
hub_the_design_agent: |
  Ask the agent to declare an unpowered hinge or slider. [Make a joint passive](/help/make-a-joint-passive) keeps its physical motion without motor control.
covers:
  - src/components/PosePanel.tsx
  - src/joints/declare.ts
  - src/sim/mjcfPassive.ts
---

Let gravity, contact or another link move a robot joint without a motor holding its position.

1. Select a part of the robot.
2. Press [[P]] to open **Pose**.
3. Right-click the joint's row.
4. In **Actuation**, choose **Passive**.
5. Set the joint's starting position with its slider.
6. In [[⌘K]], choose **Simulate**.

![The Actuation menu with Powered and Passive choices](/help/make-a-joint-passive/actuation.png)

Choosing **Passive** removes the joint's motor assignments. The joint keeps its motion axis, limits and declared physical resistance.
The motor parts stay in the scene. Declared springs stay passive too.

Simulation records the joint's motion. You can’t command it through live drive or training.
You can pose it with its slider before starting simulation.
[Sketch four-bars](/help/simulate-a-four-bar) derive their passive angles from the crank instead.

Passive joints don’t model cables or tendons. They are simulated mechanisms with no claim of physical validation.

Choose **Powered** in the same menu to restore powered behavior.
Reassign any motors through the design agent, or undo the passive edit with [[⌘Z]].
