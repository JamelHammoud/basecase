---
title: Multiply a try into demonstrations
date: 2026-11-13
collection: simulate-and-train
type: task
order: 5
keywords:
  - variations
  - augment
  - generate
  - demonstrations
  - dataset
  - mimicgen
  - training data
  - jitter
related:
  - try-a-case
  - export-a-lerobot-dataset
  - lerobot-dataset-contents
covers:
  - src/cases/tryReplay.ts
  - src/cases/tries.ts
  - src/workspace/useTryMultiply.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
---

Turn one passed try into up to 50 varied passing tries, so a dataset holds many demonstrations from one you drove.

1. Open a Case and record a try that passes. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, right-click the passed try and choose **Multiply**.

![A passed try's menu in Results, with Multiply above Delete](/help/multiply-a-try-into-demonstrations/menu.png)

3. Keep working while the toast shows "Multiplying…". To end early and keep what's done, click **Stop** in the toast.

![The toast shows Multiplying… with Stop, and a progress bar runs under the try](/help/multiply-a-try-into-demonstrations/multiplying.png)

When it's done, the toast says how many it kept: "Kept 50 of 50". The try's row counts them, as in **50 generated**.

![The passed try's row reads 50 generated, above Export Dataset](/help/multiply-a-try-into-demonstrations/results.png)

**Multiply** is also in [[⌘K]], where it multiplies the open Case's newest passed try.

## What each variation changes

Each variation moves every loose object and every spot up to 15 mm each way across the floor. It also changes friction, masses, servo strength and servo delay, the way Checks does. Then it replays the commands you drove the try with. Each arm target moves with the object or spot it was nearest at that moment, so the hand still meets it.

The Case's contract judges every variation, and only passes are kept. Multiply again for 50 more: each round uses new variations.

## Limits

Tries recorded before Multiply carry no commands, so their menu has no **Multiply**. Record a new try.

Only targets move with the objects. A try driven with the keys alone replays the same key presses, so a variation passes only when the moved spot still lies where the hand went.

A try from an earlier design of the robot can't be multiplied. The toast says "These tries are from an earlier design. Try It again to record new ones."

Deleting a try deletes its generated tries too, and the confirmation counts them.

## In the dataset

[Export Dataset](/help/export-a-lerobot-dataset) writes each generated try as its own episode. `meta/basecase.json` lists each episode's `seed` and its `source`, the try it was made from. A try you drove has a `source` of null.
