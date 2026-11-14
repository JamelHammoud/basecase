---
title: Test a robot on rough ground, steps or a slope
date: 2026-11-13
collection: simulate-and-train
type: task
order: 4
keywords:
  - terrain
  - rough ground
  - uneven
  - steps
  - stairs
  - step height
  - slope
  - ramp
  - incline
  - climb
related:
  - make-a-case
  - case-goals-worlds-and-contracts
covers:
  - src/cases/terrain.ts
  - src/cases/caseWorlds.ts
  - src/cases/groundRoute.ts
  - src/components/cases/NewCaseCard.tsx
  - electron/cad-mcp/caseTools.mjs
---

Make a Case on uneven ground sized to your robot's legs or wheels, so a walker that trips on a threshold misses it.

The scene's robot must have legs or wheels. [Make a Case](/help/make-a-case) covers the builder's other goals and worlds.

1. Click **Play** in the view rail on the left.
2. Click **Cases** at the top of the panel.
3. Click **New Case**.
4. Under **Goal**, choose **Reach a Spot**, **Push a Box**, **Follow a Path** or **Walk Without Falling**.
5. Under **World**, choose **Rough Ground**, **Steps** or **Slope**.
6. Set **Height** for Rough Ground or Steps, or **Incline** for Slope. It starts at a value sized to the robot.

![New Case on a quadruped with Walk Without Falling, Rough Ground and Height at 14 mm](/help/test-a-robot-on-rough-ground-steps-or-a-slope/new-case.png)

7. Click **Make Case**.

![A quadruped in front of a grid of gray tiles of different heights](/help/test-a-robot-on-rough-ground-steps-or-a-slope/rough-ground.png)

The Case opens in the **Simulate** tab with its ground on the canvas. Next, [try the Case](/help/try-a-case).

## What each world builds

| World | What's in it | Number | Starts at |
|---|---|---|---|
| **Rough Ground** | A grid of tiles across the route, each up to **Height** tall | **Height**, 2 to 500 mm | 0.1 × hip height on legs, 0.3 × axle height on wheels |
| **Steps** | A platform **Height** tall, a body long, to climb onto and step off | **Height**, 2 to 500 mm | 0.1 × hip height on legs, 0.5 × axle height on wheels |
| **Slope** | A ramp up, a flat top and a ramp down, each ramp 1.5 body lengths | **Incline**, 2 to 40° | 8° on legs, 12° on wheels |

A tile is half the gap between neighboring legs, or as wide as a wheel. A steeper **Incline** makes the Slope taller over the same length.

![A rover in front of a ramp that rises to a flat top](/help/test-a-robot-on-rough-ground-steps-or-a-slope/slope.png)

Checks runs each Case 20 times, and every run on Rough Ground mixes up which tile gets which height. The heights stay the same; only their places change.

## Ask the agent

In the desktop app, click **Ask the Agent** under **New Case**. Write what the robot must get over after `/case`, such as "make sure it can climb a 20 mm step", and send it. The agent picks the world and sets **Height** or **Incline** from your words.
