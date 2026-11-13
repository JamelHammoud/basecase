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
  - forge/crates/forge-train/src/bc/
---

Teach the robot a Case from tries you drove, and keep the policy only if it passes the Case on its own.

It runs in the desktop app, which trains with Forge on your computer.

1. Open a Case and drive it with **Try It** until at least five tries pass. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, click **Train From Tries**.
3. When a count appears above the button, click **Try** on the Case's row under **Train**.

![Train From Tries under five passed tries in Results](/help/train-a-policy-from-your-tries/results.png)

While it trains, the Case's row under **Train** shows the progress. On the arm-3dof test robot, ten 4-second tries trained in under 3 seconds. The 32 runs that judge the policy took about 6 seconds more.

**Train From Tries** is also in [[⌘K]].

## When the policy is kept

The policy runs the Case 32 times by itself. Each run starts with every joint up to 5° off its start pose. Each also draws its own friction, link masses, servo strength and servo delay, up to 20 ms.

At 29 passes or more, Basecase keeps the policy as the Case's skill. The count shows above the button, and the skill's row under **Train** says how many runs passed.

![32 of 32 above Train From Tries](/help/train-a-policy-from-your-tries/kept.png)

![The Touch a Point skill under Train, with 32 of 32 tries, at least 91%](/help/train-a-policy-from-your-tries/train.png)

The Case's row in **Checks** then runs the skill instead of the Case's scripted motion.

Below 29 passes, nothing is saved. The count turns red, with the start, middle and end of the worst run beside it. Drive more tries that finish the task the same way, then click **Train From Tries** again.

![0 of 32 in red, with the worst run's start, middle and end](/help/train-a-policy-from-your-tries/missed.png)

## Which tries it learns from

Only passed tries recorded on the robot as it is now count, as in [Export a LeRobot dataset](/help/export-a-lerobot-dataset). Tries recorded before Train From Tries arrived are left out too. When fewer than five count, a toast says "These tries are from an earlier design. Try It again to record new ones."

The policy learns joint targets from the joints' positions and speeds and the Case's target. It doesn't see camera video. How it's judged is in [Arena](/help/arena).
