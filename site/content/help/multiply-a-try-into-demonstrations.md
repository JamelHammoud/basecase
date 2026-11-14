---
title: Multiply a try into demonstrations
date: 2026-11-13
updated: 2026-11-14
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
  - make-a-dataset-from-tries
  - lerobot-dataset-contents
covers:
  - src/cases/tryReplay.ts
  - src/cases/tries.ts
  - src/workspace/useTryMultiply.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
---

Multiply turns one passed try into as many as 50 varied tries that also pass, so you can drive the robot once and get many demonstrations for your dataset.

1. Open a Case and record a try that passes. See [Try a Case](/help/try-a-case) for how.
2. Under **Results**, right-click the passed try and choose **Multiply**.

![A passed try's menu in Results, with Multiply above Delete](/help/multiply-a-try-into-demonstrations/menu.png)

3. While the toast shows "Multiplying…", you can keep working. To end the run and keep the variations Multiply has made so far, click **Stop** in the toast.

![The toast shows Multiplying… with Stop, and a progress bar runs under the try](/help/multiply-a-try-into-demonstrations/multiplying.png)

When the run ends, the toast shows how many variations Multiply kept, for example "Kept 50 of 50", and the try's row shows the count, such as **50 variations**.

![The passed try's row reads 50 variations](/help/multiply-a-try-into-demonstrations/results.png)

**Multiply** in [[⌘K]] works on the newest passed try in the open Case.

## What each variation changes

- Every loose object and spot moves up to 15 mm in each direction across the floor.
- In a [scanned room](/help/import-a-scanned-room), each fixed piece of furniture moves up to 50 mm and turns up to 5°. If RoomPlan was less sure about a piece, that piece moves up to 100 mm and turns up to 10°.
- Friction, masses, servo strength and servo delay vary as they do in Checks.

Each variation then replays the commands you drove the try with. Each arm target moves with whichever object or spot it was nearest at that moment, so the hand still reaches it.

Multiply checks each variation against the Case's contract and keeps only the ones that pass. Each run makes new variations, so to get 50 more, run Multiply again.

## Limits

- Tries recorded before Multiply existed carry no commands, so their menu has no **Multiply**. Record a new try instead.
- Tries from your real robot have no **Multiply** in their menu.
- An object the Case marks movable stays where the Case's code put it, and so does any arm target nearest to it.
- Only targets move with the objects. If you drove a try with the keys alone, each variation replays the same key presses and passes only if the moved spot lies where the hand went.
- You can't multiply a try from an earlier design of the robot. The toast says "These tries are from an earlier design. Try It again to record new ones."
- Deleting a try deletes its variations, and the confirmation shows how many.

## In the dataset

Under **Results**, click **Make Dataset**. The dataset includes the variations along with the try they came from. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

[Export Dataset](/help/export-a-lerobot-dataset) writes each variation as its own episode. In `meta/basecase.json`, each episode lists its `seed` and its `source`, which is the try Multiply made it from. For a try you drove, `source` is null.
