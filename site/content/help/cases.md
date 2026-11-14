---
title: Cases
date: 2026-11-13
updated: 2026-11-13
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

A Case tests whether your robot can do a task, like reaching a shelf or pushing a box. Each try ends in a pass or a miss. The Case judges every robot that fits it the same way, on every run.

Use a Case to [compare two designs](/help/compare-two-robots-on-a-case), [explore servo versions](/help/explore-servo-versions-on-a-case), or check a design before and after you change it.

## What a Case holds

- **A slot.** The kind of robot the Case needs: an arm, wheels or legs.
- **A world.** The objects around the robot. Some objects are solid, the robot can push others, and markers show a spot without getting in the way. While the Case runs, its code can move, light or hide any object marked movable.
  As you make the Case, you can add [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope) to the world, sized to the robot's legs or wheels.
- **Controls.** The commands you use to steer the robot during a try, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what has to happen for a pass, and what counts as a fail, such as a fall.
- **A time limit.** How long a try can take.
- **A console**, if the Case has one: the inputs that drive it and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any: movements you make at the camera that the Case reacts to. See [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

Each Case comes with a reference route that passes it, so you know a pass is possible. To learn about each goal and how the contract judges it, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).

## One Case, many robots

You write a Case once, and it runs on any robot that fits its slot. For an arm, Basecase measures the arm's reach from its shoulder and scales the whole world to match. If you write Touch the Dots on one arm, its dots stay within reach of the next arm you run it on.

## Tries

To take a try, drive the robot through the Case yourself. Basecase records the try 50 times a second, along with each change the Case's code makes to the world. Then it scores the recording against the contract as **Passed** or **Missed**. Results lists your tries worst first, each with four frames and a replay.

You can also run a wheeled or legged robot through a Case in the real world, using the Case printed as a floor mat. A camera tracks the robot, and the same contract judges the run. For steps, see [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into as many as 50 varied tries that also pass. The count appears on that try's row in Results.

Basecase stores your tries on this computer, along with any value the Case's code keeps, such as a high score. When you share a `.basecase` file, the Case goes with it, but its tries and those values stay behind. The Library lists tries from all your scenes. It also keeps each session on a connected robot as a try with an **Operate** badge. See [Open a try from any scene](/help/open-a-try-from-any-scene).

## A Case is the test, a skill is the answer

Cases measure what a robot can do. When you train a skill in the **Train** section, Basecase judges it in [Arena](/help/arena) with the same contract code.

Passed tries also work as demonstration data. You can turn them into a dataset to train other models. See [Export a LeRobot dataset](/help/export-a-lerobot-dataset).

## Where Cases come from

- **New Case** builds a Case from a goal and a world. For steps, see [Make a Case](/help/make-a-case).
- **Ask the Agent** lets you describe a Case in words. Type `/case` in the agent's box.
- **The agent** builds a Case when you tell it what to do with a robot, such as play a block game. It then opens the Case already running.
- **Replay in Sim** in **Operate** builds a Case from the 20 seconds before a servo fault, read from that session's try. See [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
