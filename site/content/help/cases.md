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
  - src/components/cases/CasesPanel.tsx
---

Cases turn "can my robot do this" into a pass or a miss, judged the same way for any robot that fits.

A robot that stands in the simulation tells you little about whether it can reach a shelf or push a box. A Case asks that question the same way every time, so you can compare two designs, or the same design before and after a change.

## What a Case holds

- **A slot.** What the robot needs to enter: an arm, wheels or legs.
- **A world.** Objects placed around the robot. Some are solid, some can be pushed, and markers show a spot without getting in the way.
- **Controls.** What you steer while trying it, such as Move and Turn, or Move and Raise and Lower for an arm.
- **A contract.** The rules that judge a try: what must happen to pass, and what makes it fail, such as a fall.
- **A time limit.** How long a try may take.

Every Case also carries a reference: a route that proves the Case can be passed. [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) lists each goal and exactly how it's judged.

## One Case, many robots

A Case is written once and runs on any robot that fits its slot. For an arm, Basecase scales the whole world to the arm's reach, measured from its shoulder. Touch the Dots written on one arm puts its dots within reach of the next.

## Tries

You take a try by driving the robot through the Case yourself. Basecase records it 50 times a second, then scores the recording with the contract: **Passed** or **Missed**. Results list your tries worst first, each with four frames and a replay. Multiply replays a passed try in 50 slightly moved worlds and keeps the runs that pass, shown as a count on its row.

Tries stay on this computer. A `.basecase` file you share carries the Case but not its tries.

## A Case is the test, a skill is the answer

Cases measure. Skills you train in the **Train** section are judged by the same contract code, in [Arena](/help/arena). Passed tries become demonstration data: [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns them into a dataset for training other models. [Multiply a try into varied demonstrations](/help/multiply-a-try-into-varied-demonstrations) adds more of them.

## Where Cases come from

- **New Case** builds one from a goal and a world. Steps are in [Make a Case](/help/make-a-case).
- **Ask the Agent** lets you describe one in words, with `/case` in the agent's box.
