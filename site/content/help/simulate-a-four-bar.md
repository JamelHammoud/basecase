---
title: Simulate a four-bar
date: 2026-11-16
collection: simulate-and-train
type: task
related:
  - design-a-linkage-from-a-path
  - train-an-animation-as-a-move
covers:
  - src/sim/mjcfLoops.ts
  - src/sim/loopInitial.ts
  - src/linkage/linkageParts.ts
---

Simulate a Sketch linkage under physics with one crank servo and passive bars that meet at the closing pin.

Use these steps for four-bars you insert through Sketch Path or the agent's linkage tool. Imported assembly constraints use their existing import behavior.

1. [Design a linkage from a path](/help/design-a-linkage-from-a-path).
2. Ask the agent to animate the crank back and forth within its joint range.
3. Open the **Simulate** tab.
4. Under **Control**, choose the animation by name.
5. Click **Simulate**.

   ![Crank sweep running on a four-bar in the Simulate tab](/help/simulate-a-four-bar/simulation.png)

6. Click **Pause** to inspect the coupler and rocker at their joined pin.
7. Click **Stop simulation** to return to the design.

The crank keeps the catalog servo's limits and measured behavior. The other two hinges have no holding motors.

If an older linkage asks for a servo variant, choose the variant on the crank before you restart the simulation. New linkages use STS3215 C001.

If you start with a broken or singular configuration, the simulation stops with an error. Repair the joints or insert the path again.

You can play target animations on fixed mechanisms. For native policy training, you must use a floating base. A trained skill must pass Arena before you can use it as a ready skill.
