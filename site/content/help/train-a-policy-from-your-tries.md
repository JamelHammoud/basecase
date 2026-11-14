---
title: Train a policy from your tries
date: 2026-11-13
updated: 2026-11-13
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
  - try-a-case
  - arena
covers:
  - src/components/simulate/FromTries.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTriesTraining.ts
  - src/workspace/caseCommands.tsx
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
2. Under **Results**, click **Train from Tries**.
3. When a count appears above the button, click **Try** on the Case's row under **Train**.

![Train from Tries under five passed tries in Results](/help/train-a-policy-from-your-tries/results.png)

While it trains, the Case's row under **Train** shows the progress. On the arm-3dof test robot, ten 4-second tries trained in under 3 seconds, and the 32 runs that judge the policy took about 6 seconds more.

**Note:** You can also find **Train from Tries** in [[⌘K]].

## When the policy is kept

To judge the policy, Basecase has it run the Case 32 times by itself. In each run, every joint starts up to 5° off its start pose, and the run draws its own friction, link masses, servo strength and servo delay (up to 20 ms).

If 29 or more runs pass, Basecase keeps the policy as the Case's skill. The count appears above the button, and the skill's row under **Train** shows how many runs passed.

![32 of 32 above Train from Tries](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

From then on, the Case's row in **Checks** runs the skill instead of the Case's scripted motion.

If fewer than 29 runs pass, Basecase saves nothing. The count turns red, and the start, middle and end of the worst run appear beside it. Drive more tries that finish the task the same way, then click **Train from Tries** again.

![0 of 32 in red, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Train from Tries uses only passed tries recorded on the robot as it is now, the same tries that [Export a LeRobot dataset](/help/export-a-lerobot-dataset) uses. It leaves out tries recorded before Train from Tries arrived, and tries from your real robot. If fewer than five tries count, a toast says "These tries are from an earlier design. Try It again to record new ones."

Tries that **Multiply** made from a passed try count too, so one try you drove can be enough. For more, see [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. To learn how the policy is judged, see [Arena](/help/arena).
