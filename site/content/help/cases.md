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

Cases turn "can my robot do this" into a pass or a miss, judged the same way for any robot that fits.

A robot that stands in the simulation tells you little about whether it can reach a shelf or push a box. A Case asks that question the same way every time, so you can [compare two designs](/help/compare-two-robots-on-a-case), [explore servo versions](/help/explore-servo-versions-on-a-case), or the same design before and after a change.

## What a Case holds

- **A slot.** What the robot needs to enter: an arm, wheels or legs.
- **A world.** Objects placed around the robot. Some are solid, some can be pushed, and markers show a spot without getting in the way. Ones marked movable can be moved, lit or hidden by the Case's code while it runs.
  The ground can be part of it too: [rough ground, a step or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope), sized to the robot's legs or wheels when you make the Case.
- **Controls.** What you steer while trying it, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what must happen to pass, and what makes it fail, such as a fall.
- **A time limit.** How long a try may take.
- **A console**, if it has one. The inputs that drive it and the panels around the canvas when you [run it](/help/run-a-case).
- **Gestures**, if you taught it any: movements it reacts to at the camera, as in [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

Every Case also carries a reference: a route that proves the Case can be passed. [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) lists each goal and exactly how it's judged.

## One Case, many robots

A Case is written once and runs on any robot that fits its slot. For an arm, Basecase scales the whole world to the arm's reach, measured from its shoulder. Touch the Dots written on one arm puts its dots within reach of the next.

## Tries

You take a try by driving the robot through the Case yourself. Basecase records it 50 times a second, along with each change the Case's code makes to the world, then scores the recording with the contract: **Passed** or **Missed**. Results list your tries worst first, each with four frames and a replay.

A wheeled or legged robot can also try a Case for real, on the Case printed as a floor mat. A camera tracks it, and the same contract judges the run. Steps are in [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

Basecase splits each try into segments named from what the robot did, such as grasp the block. You can move, split and rename them, and tag tries. Steps are in [Label the segments of a try](/help/label-the-segments-of-a-try).

[Multiply](/help/multiply-a-try-into-demonstrations) turns a passed try into up to 50 varied passing tries. Results count them on that try's row.

Tries stay on this computer, and so does a value the Case's code keeps, such as a high score. A `.basecase` file you share carries the Case but neither of these. The Library lists the tries from every scene, as [Open a try from any scene](/help/open-a-try-from-any-scene) shows.

## A Case is the test, a skill is the answer

Cases measure. Skills you train in the **Train** section are judged by the same contract code, in [Arena](/help/arena). Passed tries become demonstration data: [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns them into a dataset for training other models.

## Where Cases come from

- **New Case** builds one from a goal and a world. Steps are in [Make a Case](/help/make-a-case).
- **Ask the Agent** lets you describe one in words, with `/case` in the agent's box.
- **The agent** also builds one when you tell it what to do with a robot, such as a block game, and opens it running.
- **Replay in Sim** in **Operate** builds one from the 20 seconds before a servo fault. Steps are in [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
