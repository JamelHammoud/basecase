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

Drive a Case yourself, and Basecase can train a policy from your tries. It keeps the policy only if the policy passes the Case on its own.

Training runs in the desktop app and uses Forge to train on your computer.

1. Open a Case and drive it with **Try It** until at least five tries pass. For steps, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To train on tries from other scenes too, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Train from Tries**.

![Touch a Point open as a dataset, with its episodes, total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

4. When a count appears under the buttons, click **Done**. Then click **Try** on the Case's row under **Train**.

While the policy trains, the Case's row under **Train** shows the progress. On the arm-3dof test robot, ten 4-second tries trained in under 3 seconds, and the 32 runs that judge the policy took about 6 seconds more.

**Note:** While a dataset is open, you can also find **Train from Tries** in [[⌘K]] once five of the dataset's tries have passed. The dataset's Case judges the policy. If another Case is open, Basecase opens the dataset's Case first. If the dataset has no Case in this scene, you get **New Case** instead, so you can make one.

## When the policy is kept

To judge the policy, Basecase has it run the Case 32 times by itself. In each run, every joint starts up to 5° off its start pose, and the run draws its own friction, link masses, servo strength and servo delay (up to 20 ms).

If 29 or more runs pass, Basecase keeps the policy as the Case's skill. The number of runs that passed appears under the dataset's buttons and in the skill's row under **Train**.

![32 of 32 under the dataset's buttons](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

From then on, the Case's row in **Checks** runs the skill instead of the Case's scripted motion.

If fewer than 29 runs pass, Basecase saves nothing. The count turns red, with the start, middle and end of the worst run beside it. Drive more tries that finish the task the same way, then click **Train from Tries** again.

![A count in red under the dataset's buttons, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Train from Tries uses only the dataset's passed tries that were recorded on the robot as it is now, the same tries that [Export a LeRobot dataset](/help/export-a-lerobot-dataset) uses. It leaves out tries from your real robot. If fewer than five tries count, a toast says "These tries are from an earlier design. Try It again to record new ones."

Training sends the tries in the dataset's own order, and Forge holds out every fifth try to check its learning on. The same dataset trains on the same tries in the same order every time. If the tries changed, Basecase saves them as the dataset's next version when you train.

Some tries, such as those recorded before Train from Tries arrived, record joint positions without speeds. On a robot with a fixed base, Basecase works out each joint's speed from how far it moved since the previous frame, 25 times a second. A robot whose base moves, such as a rover or a walker, needs tries with speeds.

Tries that **Multiply** made from a passed try count too, so one try you drove can be enough. For more, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. To learn how the policy is judged, see [Arena](/help/arena).
