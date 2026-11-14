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

A Case tests whether your robot can do a task. Every try ends in a pass or a miss, and Basecase judges it the same way on any robot that fits.

Watching a robot stand in the simulation won't tell you if it can reach a shelf or push a box. A Case holds every try to the same rules, so results from different runs mean the same thing. You can use a Case to [compare two designs](/help/compare-two-robots-on-a-case), to [explore servo versions](/help/explore-servo-versions-on-a-case), or to check one design before and after a change.

## What a Case holds

- **A slot.** The kind of robot the Case needs: an arm, wheels or legs.
- **A world.** The objects around the robot. Objects can be solid or pushable. Markers show a spot without getting in the robot's way. During a run, the Case's code can move, light or hide any object tagged movable.
  The world can include the ground. When you make the Case, you can add [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope), sized to the robot's legs or wheels.
- **Controls.** The commands you steer with during a try. For example, Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules for a try: what it takes to pass, and what fails it, such as a fall.
- **A time limit.** How long a try can last.
- **A console**, if the Case has one. It's made of the inputs that drive the Case and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any. These are movements you make at the camera that the Case reacts to. See [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

Every Case comes with a reference route that passes it, so you know a pass is possible. To see each goal and how the contract judges it, read [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).

## One Case, many robots

You write a Case once, then run it on any robot that fits its slot. For an arm, Basecase measures how far the arm reaches from its shoulder and scales the whole world to match. If you write Touch the Dots on one arm, the next arm can reach the same dots.

## Tries

To take a try, drive the robot through the Case. Basecase records the try 50 times a second, along with each change the Case's code makes to the world. It then scores the recording against the contract as **Passed** or **Missed**. Results lists your tries worst first. Each try has four frames and a replay.

You can also run a wheeled or legged robot through a Case in the real world, on the Case printed as a floor mat. A camera tracks the robot, and Basecase judges the run with the same contract. To set this up, see [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into up to 50 varied passing tries. Results shows the count on that try's row.

You can also bring in teleop data from another source as tries. See [Import robot data as tries](/help/import-robot-data-as-tries). An imported try has no Case, so nothing scores it.

Basecase keeps your tries on this computer, along with any value the Case's code saves, such as a high score. When you share a `.basecase` file, you share the Case without its tries or those values.

The Library lists tries from all of your scenes. See [Open a try from any scene](/help/open-a-try-from-any-scene). To find tries by words, by facts such as failed, or by a similar motion, see [Search tries](/help/search-tries).

## A Case is the test, a skill is the answer

When you train a skill in the **Train** section, Basecase judges it in [Arena](/help/arena) with the same contract code. Passed tries also work as demonstration data. [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns them into a dataset you can train other models on.

## Where Cases come from

- **New Case** builds a Case from a goal and a world. See [Make a Case](/help/make-a-case).
- **Ask the Agent** lets you describe a Case in words. Type `/case` in the agent's box.
- **The agent** builds a Case when you tell it what to do with a robot, such as play a block game. It opens the Case mid-run.
- **Replay in Sim** in **Operate** builds a Case from the 20 seconds before a servo fault. See [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
