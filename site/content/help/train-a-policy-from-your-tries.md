---
title: Train a policy from your tries
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - imitation learning
  - behaviour cloning
  - behavior cloning
  - demonstrations
  - teleop
  - act
  - lerobot
  - policy
related:
  - make-a-dataset-from-tries
  - arena
covers:
  - src/components/tries/DatasetPane.tsx
  - src/components/tries/TriesResultRow.tsx
  - src/workspace/useTriesTraining.ts
  - src/workspace/useDatasets.ts
  - src/workspace/datasetCommands.tsx
  - src/datasets/datasetSplit.ts
  - src/workspace/caseChecks.ts
  - src/skills/triesTraining.ts
  - src/datasets/demos.ts
  - src/datasets/usableTries.ts
  - src/workspace/useTryMultiply.ts
  - forge/crates/forge-train/src/bc/
---

Teach the robot a Case from tries you drove, and keep the policy only if it passes the Case on its own.

It runs in the desktop app, which trains with Forge on your computer.

1. Open a Case and drive it with **Try It** until at least five tries pass. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To train on tries from other scenes too, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Train from Tries**.

4. When a count appears under the buttons, click **Done**, then click **Try** on the Case's row under **Train**.

While it trains, the Case's row under **Train** shows the progress. On the arm-3dof test robot, ten 4-second tries trained in under 3 seconds. The 32 runs that judge the policy took about 6 seconds more.

**Train from Tries** is also in [[⌘K]] while a dataset is open. It shows once five of the dataset's tries passed. The dataset's Case judges the policy, and Basecase opens that Case first if another one is open. A dataset with no Case in this scene opens **New Case** instead, to make one.

## When the policy is kept

The policy runs the Case 32 times by itself. Each run starts with every joint up to 5° off its start pose. Each also draws its own friction, link masses, servo strength and servo delay, up to 20 ms.

At 29 passes or more, Basecase keeps the policy as the Case's skill. The count shows under the dataset's buttons, and the skill's row under **Train** says how many runs passed.

![32 of 32 under the dataset's buttons](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

The Case's row in **Checks** then runs the skill instead of the Case's scripted motion.

Below 29 passes, nothing is saved. The count turns red, with the start, middle and end of the worst run beside it. Drive more tries that finish the task the same way, then click **Train from Tries** again.

![A count in red under the dataset's buttons, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Only the dataset's passed tries recorded on the robot as it is now count, as in [Export a LeRobot dataset](/help/export-a-lerobot-dataset). Tries from your real robot are left out. When fewer than five count, a toast says "These tries are from an earlier design. Try It again to record new ones."

Training sends the tries in the dataset's own order, and Forge holds out every fifth one to check its learning on. The same dataset trains on the same tries in the same order every time, and training saves them as the dataset's next version when they changed.

Some tries record joint positions without speeds, such as tries recorded before Train from Tries arrived. On a robot with a fixed base, Basecase works out each joint's speed from how far it moved since the previous frame, 25 times a second. A robot whose base moves, such as a rover or a walker, needs tries with speeds.

Tries that **Multiply** made from a passed try count too, so one try you drove can be enough. See [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. How it's judged is in [Arena](/help/arena).
