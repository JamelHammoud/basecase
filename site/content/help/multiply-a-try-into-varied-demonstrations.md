---
title: Multiply a try into varied demonstrations
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - augment
  - mimicgen
  - demonstrations
  - variations
  - dataset
  - generate
related:
  - export-a-lerobot-dataset
  - pick-up-a-block-with-a-gripper
covers:
  - src/cases/multiply.ts
  - src/cases/variedWorld.ts
  - src/workspace/useMultiply.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
---

Turn one passed try into dozens of passing ones, each with the block and spot moved, so a dataset holds more than the tries you drove.

A robot model needs hundreds of demonstrations to learn a task. Driving each one by hand is the slow part. Multiply runs your try 50 more times in simulation, each in a slightly different world, and keeps the runs that pass.

1. Open a Case and click **Try It**.
2. Drive the try until it passes. Steps are in [Try a Case](/help/try-a-case).
3. Under **Results**, right-click the passed try and choose **Multiply**.

![The try menu in Results with Multiply above Delete](/help/multiply-a-try-into-varied-demonstrations/menu.png)

4. Wait while the toast counts the passing runs.

![The toast counting generated tries, with Stop](/help/multiply-a-try-into-varied-demonstrations/progress.png)

![Results with the passed try showing its generated count](/help/multiply-a-try-into-varied-demonstrations/results.png)

To end early and keep what's made, click **Stop** in the toast. The try's row shows how many passed, such as "50 generated". **Multiply Try** is in [[⌘K]], where it takes your newest passed try.

## What changes in each run

Every block, ball or other loose object moves up to 15 mm each way along the floor, and so does each spot. Friction, masses, servo strength and servo delay change too, the same way Checks varies them. Near an object, the arm's hand follows it, so it still grips the block and still sets it on the spot.

A run that misses is dropped. Multiply again to add 50 more runs with new seeds.

## Which tries can be multiplied

The try must have passed, and you must have driven it in this version of Basecase. Tries recorded earlier, and tries driven by a trained walk, don't keep the commands Multiply replays. A wheeled robot replays its speeds as they were, without following the moved objects.

Generated tries go into [Export a LeRobot dataset](/help/export-a-lerobot-dataset) beside the try they came from. Deleting that try deletes them too.
