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

A Case tests whether your robot can do a task. Each try ends in a pass or a miss, and the Case judges it the same way for any robot that fits.

Watching a robot stand in the simulation tells you little about whether it can reach a shelf or push a box. A Case asks that question the same way every time. Use it to [compare two designs](/help/compare-two-robots-on-a-case), [explore servo versions](/help/explore-servo-versions-on-a-case), or check the same design before and after a change.

## What a Case holds

- **A slot.** The kind of robot the Case needs: an arm, wheels or legs.
- **A world.** The objects placed around the robot. Some are solid, some the robot can push, and markers show a spot without getting in the way. While the Case runs, its code can move, light or hide any object marked movable.
  The ground can be part of the world too. When you make the Case, you can add [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope), sized to the robot's legs or wheels.
- **Controls.** The commands you steer with during a try, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what must happen for it to pass, and what makes it fail, such as a fall.
- **A time limit.** How long a try can take.
- **A console**, if the Case has one: the inputs that drive it and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any: movements at the camera that the Case reacts to. See [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

Every Case comes with a reference route that passes it, so you know a pass is possible. [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) lists each goal and how the contract judges it.

## One Case, many robots

Write a Case once and it runs on any robot that fits its slot. For an arm, Basecase measures the arm's reach from its shoulder and scales the whole world to match. If you write Touch the Dots on one arm, its dots stay within reach of the next arm too.

## Tries

To take a try, you drive the robot through the Case yourself. Basecase records the try 50 times a second, along with each change the Case's code makes to the world. Then it scores the recording against the contract as **Passed** or **Missed**. Results lists your tries worst first, each with four frames and a replay.

You can also run a wheeled or legged robot through a Case in the real world, on the Case printed as a floor mat. A camera tracks the robot, and the same contract judges the run. For steps, see [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into up to 50 varied passing tries. Results shows the count on that try's row.

Tries can also come from teleop data recorded elsewhere. See [Import robot data as tries](/help/import-robot-data-as-tries). An imported try has no Case, so Basecase never scores it.

Basecase stores tries on this computer, along with any value the Case's code keeps, such as a high score. When you share a `.basecase` file, the Case goes without its tries or those values. The Library lists tries from all your scenes. See [Open a try from any scene](/help/open-a-try-from-any-scene).

## A Case is the test, a skill is the answer

Cases measure what a robot can do. When you train a skill in the **Train** section, Basecase judges it in [Arena](/help/arena) with the same contract code. Passed tries also work as demonstration data: [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns them into a dataset for training other models.

## Where Cases come from

- **New Case** builds a Case from a goal and a world. For steps, see [Make a Case](/help/make-a-case).
- **Ask the Agent** lets you describe a Case in words: type `/case` in the agent's box.
- **The agent** builds a Case when you tell it what to do with a robot, such as play a block game, and opens the Case already running.
- **Replay in Sim** in **Operate** builds a Case from the 20 seconds before a servo fault. For steps, see [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
