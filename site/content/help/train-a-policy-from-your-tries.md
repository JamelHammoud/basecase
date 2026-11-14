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

You can train a policy from tries you drive yourself in a Case. Basecase keeps the policy only if it passes the Case on its own.

You train in the desktop app, with Forge on your computer.

1. Open a Case and drive it with **Try It** until at least five tries pass. To learn how, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from a Library search instead, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Train from Tries**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

4. Wait for a count under the buttons, then click **Done**.
5. Under **Train**, click **Try** on the Case's row.

Follow the policy's progress in the Case's row under **Train**. On the arm-3dof test robot, training on ten 4-second tries took under 3 seconds. The 32 runs that judge the policy took about 6 seconds more.

**Note:** With a dataset open, **Train from Tries** is also in [[⌘K]] once five of its tries have passed. Basecase judges the policy with the dataset's Case, and opens that Case first if another Case is open. If the dataset has no Case in this scene and no Case is open, you see **New Case** instead, so you can make one.

## When the policy is kept

To judge the policy, Basecase has it run the Case by itself 32 times. In each run, every joint starts up to 5° off its start pose. Basecase also varies friction, link masses, servo strength and servo delay (up to 20 ms) from run to run.

If 29 or more runs pass, Basecase keeps the policy as the Case's skill. The number of runs that passed appears under the dataset's buttons and in the skill's row under **Train**.

![32 of 32 under the dataset's buttons](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

From then on, Basecase runs the skill for the Case's row in **Checks**, in place of the Case's scripted motion.

If fewer than 29 runs pass, Basecase saves nothing and shows the count in red, with the start, middle and end of the worst run beside it. Drive more tries that finish the task the same way, then click **Train from Tries** again.

![A count in red under the dataset's buttons, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Train from Tries uses only the dataset's passed tries from the open Case, recorded on the robot as it is now. [Export a LeRobot dataset](/help/export-a-lerobot-dataset) uses the same tries. Basecase leaves out:

- Tries from your real robot
- Tries from another Case or scene
- Tries recorded before the robot last changed

If fewer than five tries count, you see a toast that says "Export and training take only passed tries of this Case as it is now. Try It to record more."

Basecase trains on the tries in the dataset's own order, and Forge holds out every fifth try to check what it has learned. Train the same dataset again and Basecase uses the same tries in the same order. Train after the tries change, and Basecase saves them as the dataset's next version.

Some tries have joint positions but no speeds, such as tries recorded before Train from Tries arrived. On a robot with a fixed base, Basecase works out each joint's speed from how far it moved since the previous frame, 25 times a second. A robot whose base moves, like a rover or a walker, needs tries that include speeds.

Tries that **Multiply** made from a passed try also count, so a single try you drove can be enough. For more, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. To learn how Basecase judges the policy, see [Arena](/help/arena).
