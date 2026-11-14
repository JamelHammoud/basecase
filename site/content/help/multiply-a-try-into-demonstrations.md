---
title: Multiply a try into demonstrations
date: 2026-11-13
updated: 2026-11-13
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

Multiply takes one passed try and makes up to 50 varied tries that also pass. You drive the robot once, and your dataset gets many demonstrations.

1. Open a Case and record a try that passes. To learn how, see [Try a Case](/help/try-a-case).
2. Under **Results**, right-click the passed try, then choose **Multiply**.

   ![A passed try's menu in Results, with Multiply above Delete](/help/multiply-a-try-into-demonstrations/menu.png)

3. You can keep working while the toast shows "Multiplying…". To stop early and keep the variations made so far, click **Stop** in the toast.

   ![The toast shows Multiplying… with Stop, and a progress bar runs under the try](/help/multiply-a-try-into-demonstrations/multiplying.png)

When Multiply finishes, the toast shows how many variations it kept, for example "Kept 50 of 50". The try's row then shows the count, such as **50 variations**.

![The passed try's row reads 50 variations](/help/multiply-a-try-into-demonstrations/results.png)

You can also choose **Multiply** from [[⌘K]]. There it multiplies the newest passed try in the open Case.

## What each variation changes

Each variation makes small changes to the scene:

- Every loose object and every spot moves up to 15 mm in each direction across the floor.
- In a [scanned room](/help/import-a-scanned-room), each fixed piece of furniture moves up to 50 mm and turns up to 5°. If RoomPlan was less sure about a piece, it moves up to 100 mm and turns up to 10°.
- Friction, masses, servo strength and servo delay change the same way they do in Checks.

Then the variation replays the commands you used to drive the try. Each arm target moves with whichever object or spot it was nearest to at that moment, so the hand still reaches it.

The Case's contract judges every variation, and Multiply keeps only the ones that pass. To make another 50, multiply again. Each round uses new variations.

## Limits

Tries recorded before Multiply don't carry any commands, so their menu doesn't show **Multiply**. Record a new try instead. Tries from your real robot don't show **Multiply** either.

Multiply never shifts an object the Case marks movable. The object stays where the Case's code put it, and any arm target nearest to it stays where it was.

Only targets move with the objects. If you drove a try using only the keys, each variation replays the same key presses. It passes only if the moved spot is still where the hand went.

You can't multiply a try from an earlier design of the robot. The toast says "These tries are from an earlier design. Try It again to record new ones."

Deleting a try also deletes its variations. The confirmation shows how many.

## In the dataset

**Make Dataset** in Results includes the variations along with the try they came from. See [Make a dataset from tries](/help/make-a-dataset-from-tries). [Export Dataset](/help/export-a-lerobot-dataset) writes each variation as its own episode. In `meta/basecase.json`, each episode lists its `seed` and its `source`, which is the try it was made from. For a try you drove, `source` is null.
