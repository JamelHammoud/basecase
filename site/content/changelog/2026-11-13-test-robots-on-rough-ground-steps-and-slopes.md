---
title: Test robots on rough ground, steps and slopes
date: 2026-11-13
image: /changelog/test-robots-on-rough-ground-steps-and-slopes/cover.png
---

You can now make a Case on rough ground, over a step or up a slope, sized to your robot's legs or wheels. In New Case, pick **Rough Ground**, **Steps** or **Slope** as the World.

Until now, every Case with a walking goal ran on a flat floor. Our test quadruped walks 500 mm there on all 5 seeded runs, and over an 18 mm step it misses all 5.

## One Number Per World

Rough Ground and Steps take a **Height** in mm, and Slope takes an **Incline** in degrees.

Height starts from the robot's hip or axle height, and Incline starts from whether it walks or rolls. For the quadruped, that's 14 mm of Rough Ground, which it crossed on all 5 seeded runs.

Checks runs each Case 20 times. On Rough Ground, each run shuffles which tile is tallest.

## Built From Boxes

The ground is plain boxes, so it runs in MuJoCo with nothing new in the model. There's no height map and no uneven floor from a scan.

You can't pick Push a Box on these worlds, because the box catches on the tiles and the step.

## Ask the Agent

The agent's `create_case` takes the three worlds too, so asking it to "make sure it can climb a step" builds a Case.

Read [Test a robot on rough ground, steps or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope) in the help center for the steps.
