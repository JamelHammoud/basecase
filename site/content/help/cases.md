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
  - src/cases/tryStore.ts
  - src/cases/caseBuilder.ts
  - src/cases/gestures.ts
  - src/cases/terrain.ts
  - src/components/cases/CasesPanel.tsx
---

A Case tests whether your robot can do a task. Each try ends as a pass or a miss, and Basecase judges every robot that fits the Case by the same rules.

Watching a robot stand in the simulation tells you little about whether it can reach a shelf or push a box. A Case tests that the same way every time, so you can [compare two designs](/help/compare-two-robots-on-a-case), [explore servo versions](/help/explore-servo-versions-on-a-case), or check one design before and after a change.

## What a Case holds

- **A slot.** The body a robot needs to enter the Case: an arm, wheels or legs.
- **A world.** The objects placed around the robot. Some are solid, some can be pushed, and markers show a spot without getting in the way. While the Case runs, its code can move, light or hide any object marked movable.
  The ground can be part of the world. You can add [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope), and Basecase sizes it to the robot's legs or wheels when you make the Case.
- **Controls.** The moves you steer while you try the Case, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what must happen to pass, and what fails it, such as a fall.
- **A time limit.** The longest a try can take.
- **A console**, if the Case has one: the inputs that drive the Case and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any: movements the Case reacts to at the camera. [Teach a robot a gesture](/help/teach-a-robot-a-gesture) shows how.

Each Case also has a reference, a route that proves a robot can pass it. [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) lists each goal and how the contract judges it.

## One Case, many robots

You write a Case once, and it runs on any robot that fits its slot. For an arm, Basecase scales the whole world to the arm's reach, measured from its shoulder. If you write Touch the Dots for one arm, the next arm can reach its dots too.

## Tries

To take a try, drive the robot through the Case yourself. Basecase records the try 50 times a second, along with each change the Case's code makes to the world. It then scores the recording against the contract as **Passed** or **Missed**. Results lists your tries worst first, each with four frames and a replay.

A wheeled or legged robot can try a Case for real, on a floor mat print of the Case. A camera tracks the robot, and the same contract judges the run. [Try a Case on your real robot](/help/try-a-case-on-your-real-robot) has the steps.

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into up to 50 varied passing tries, and Results shows the count on that try's row.

Your tries stay on this computer, along with any value the Case's code keeps, such as a high score. A `.basecase` file you share carries the Case but leaves out your tries and those values.

## A Case is the test, a skill is the answer

A Case measures a robot. In [Arena](/help/arena), the same contract code judges the skills you train in the **Train** section. Passed tries also work as demonstration data, and [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns them into a dataset for training other models.

## Where Cases come from

- **New Case** builds a Case from a goal and a world. [Make a Case](/help/make-a-case) covers the steps.
- **Ask the Agent** lets you describe a Case in words: type `/case` in the agent's box.
- **The agent** builds a Case when you tell it what to do with a robot, such as play a block game, and opens it running.
- **Replay in Sim** in **Operate** builds a Case from the 20 seconds before a servo fault. For steps, see [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
