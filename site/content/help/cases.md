---
title: Cases
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: concept
order: 2
keywords:
  - challenge
  - level
  - benchmark
  - test
  - task
  - world
  - goal
  - evaluation
related:
  - make-a-case
  - case-goals-worlds-and-contracts
covers:
  - src/cases/schema.ts
  - src/cases/scale.ts
  - src/cases/robotFit.ts
  - src/cases/tries.ts
  - src/cases/tryStore/
  - src/cases/tryFile.ts
  - src/cases/caseBuilder.ts
  - src/cases/gestures.ts
  - src/cases/terrain.ts
  - src/components/cases/CasesPanel.tsx
---

A Case tests whether your robot can do a task. Each try ends in a pass or a miss, and Basecase judges it by the same rules for any robot that fits.

Watching a robot stand in the simulation won't tell you whether it can reach a shelf or push a box. A Case checks that, and it checks the same way on every run. Use one to [compare two designs](/help/compare-two-robots-on-a-case), [explore servo versions](/help/explore-servo-versions-on-a-case), or check a design before and after you change it.

## What a Case holds

- **A slot.** The kind of robot the Case needs: an arm, wheels or legs.
- **A world.** The objects around the robot. Some are solid, and the robot can push others. Markers show a spot and block nothing. While the Case runs, its code can move, light or hide any object with the movable mark.
  The ground is part of the world too. As you make the Case, you can add [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope), sized to fit the robot's legs or wheels.
- **Controls.** The commands you steer with during a try, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what has to happen for a pass, and what fails it, such as a fall.
- **A time limit.** How long a try can last.
- **A console**, if the Case has one: the inputs that drive the Case and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any: movements you make at the camera that the Case reacts to. See [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

Every Case comes with a reference route that passes it, so you know a pass is possible. [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) covers each goal and how its contract judges it.

## One Case, many robots

You write a Case for one robot, then run it on any robot that fits its slot. For an arm, Basecase measures the arm's reach from its shoulder and scales the whole world to match. If you write Touch the Dots on one arm and run it on another, the dots stay within reach.

## Tries

To take a try, drive the robot through the Case. Basecase records the try 50 times a second, along with every change the Case's code makes to the world. At the end of the try, Basecase scores the recording against the contract as **Passed** or **Missed**. Results lists your tries worst first, each with four frames and a replay.

You can also run a wheeled or legged robot through a Case in the real world, on the Case printed as a floor mat. A camera tracks the robot, and the same contract judges the run. [Try a Case on your real robot](/help/try-a-case-on-your-real-robot) has the steps.

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into up to 50 varied passing tries. Results shows the count on that try's row.

Tries stay on this computer, along with any value the Case's code saves, such as a high score. A `.basecase` file you share carries the Case but leaves out its tries and those saved values.

- The Library lists tries from all your scenes. See [Open a try from any scene](/help/open-a-try-from-any-scene).
- The Library's search finds tries by words, facts and motion. See [Search tries](/help/search-tries).

## A Case is the test, a skill is the answer

A Case measures what a robot can do. Train a skill in the **Train** section, and Basecase judges it in [Arena](/help/arena) with the same contract code.

Passed tries also work as demonstration data. To train other models on them, [export a LeRobot dataset](/help/export-a-lerobot-dataset).

## Where Cases come from

- **New Case** builds a Case from a goal and a world. See [Make a Case](/help/make-a-case) for the steps.
- **Ask the Agent** builds a Case you describe in words. Type `/case` in the agent's box.
- **The agent** builds a Case when you tell it what to do with a robot, for example, to play a block game. Then it opens the Case running.
- **Replay in Sim** in **Operate** builds a Case from the 20 seconds before a servo fault. See [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
