---
title: Train a policy from your tries
date: 2026-11-13
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

You can teach your robot a Case from tries you drove yourself. Basecase keeps the policy only if it passes the Case on its own.

Training runs in the desktop app, which uses Forge to train on your computer.

1. Open a Case and drive it with **Try It** until at least five tries pass. For steps, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from a Library search instead, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Train from Tries**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

4. When a count appears under the buttons, click **Done**.
5. Under **Train**, click **Try** on the Case's row.

While it trains, the Case's row under **Train** shows the progress. On the arm-3dof test robot, ten 4-second tries trained in under 3 seconds, and the 32 runs that judge the policy took about 6 seconds more.

**Note:** With a dataset open, **Train from Tries** is also in [[⌘K]] once five of its tries have passed. Basecase judges the policy with the dataset's Case. If another Case is open, Basecase opens the dataset's Case first. If the dataset's Case isn't in this scene, or the dataset has no Case and none is open, you see **New Case** instead.

## When the policy is kept

To judge the policy, Basecase has it run the Case 32 times by itself. In each run, every joint starts up to 5° off its start pose, and the run draws its own friction, link masses, servo strength and servo delay (up to 20 ms).

If 29 or more runs pass, Basecase keeps the policy as the Case's skill. The count appears under the dataset's buttons, and the skill's row under **Train** shows how many runs passed.

![32 of 32 under the dataset's buttons](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

From then on, the Case's row in **Checks** runs the skill instead of the Case's scripted motion.

If fewer than 29 runs pass, Basecase saves nothing. The count turns red, and the start, middle and end of the worst run appear beside it. Drive more tries that finish the task the same way, then click **Train from Tries** again.

![A count in red under the dataset's buttons, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Train from Tries uses the dataset's passed and unjudged tries that fit the current robot model. These are the same samples that [Export a LeRobot dataset](/help/export-a-lerobot-dataset) uses. Failed tries, real-robot tries and any try with a quality flag are left out. A segment selection contributes only its selected frames. If fewer than five samples count, a toast says "Export and training take only passed tries of this Case as it is now. Try It to record more."

Training freezes the working dataset's samples, labels, exclusions and split assignments as a version. Forge uses that version's training and validation groups, with the same assignments as export. Test samples stay out of fitting and validation. Segments, variations and identical recording content stay with their source. Imported split assignments remain explicit, and conflicting assignments stop the job with an error.

Training needs at least one training sample and one validation sample from those frozen assignments. Multiplying one source doesn't create an independent validation source.

Each selected range needs at least two frames after sampling at 25 frames per second. Shorter ranges stop training with an error.

To train an earlier saved version, choose it in **Dataset version**, then click **Train from Tries**. Its saved robot model must match the current robot. Missing recordings stop training with an error. Versions without saved samples can't restore historical labels, so choose **Working Dataset** to freeze the current samples instead.

Some tries hold joint positions but no speeds. Imported tries are like this, and so are tries recorded before Train from Tries arrived. On a robot with a fixed base, Basecase works out each joint's speed from how far it moved since the previous frame, 25 times a second. A robot whose base moves, like a rover or a walker, needs tries that include speeds.

Tries that **Multiply** made from a passed try count too, within their source's split. For more, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. To learn how the policy is judged, see [Arena](/help/arena).
