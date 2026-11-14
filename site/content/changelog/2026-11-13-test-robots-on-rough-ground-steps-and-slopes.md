---
title: Test robots on rough ground, steps and slopes
date: 2026-11-13
image: /changelog/test-robots-on-rough-ground-steps-and-slopes/cover.png
---

You can now make a Case on rough ground, over a step or up a slope, sized to your robot's legs or wheels. Pick **Rough Ground**, **Steps** or **Slope** as the World in New Case.

Every Case with a walking goal used to run on a flat floor. Our test quadruped walks 500 mm there on all 5 seeded runs, and misses all 5 over an 18 mm step.

Each world has one number. Rough Ground and Steps take a **Height** in mm, and Slope an **Incline** in degrees. Height starts from the robot's hip or axle height, and Incline from whether it walks or rolls. That's 14 mm of Rough Ground on the quadruped, which it crossed on all 5 seeded runs.

Checks runs each Case 20 times. On Rough Ground, each run shuffles which tile is tallest.

The ground is built from plain boxes, so it runs in MuJoCo with nothing new in the model. There's no height map or uneven floor from a scan. Push a Box isn't offered on these worlds, since the box catches on the tiles and the step.

The agent's `create_case` takes the three worlds too, so "make sure it can climb a step" builds a Case.

Steps are in [Test a robot on rough ground, steps or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope).
