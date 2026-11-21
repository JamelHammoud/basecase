---
title: Branch a simulated try
date: 2026-11-20
collection: simulate-and-train
type: task
keywords:
  - checkpoint
  - recovery
  - continuation
related:
  - try-a-case
  - open-a-try-from-any-scene
covers:
  - src/components/simulate/BranchTryControls.tsx
  - src/components/simulate/TryTimeline.tsx
  - src/workspace/useCaseBranch.ts
  - src/workspace/tryFileActions.ts
  - src/cases/tryArchive.ts
---

You can record a different ending for a new single-robot scripted simulation without changing its saved source.

1. In the Case's **Try** section, click **Try Reference** to record a new scripted try.
2. In **Library**, click the robot's tries.
3. In **Tries**, click the saved try.
4. In the timeline's **Checkpoint** list, choose a retained time.

![Touch the Dots open at a retained checkpoint with Branch Try available](/help/branch-a-simulated-try/checkpoint.png)

5. In the timeline, click **Branch Try**.
6. On the canvas, drive a different ending using the displayed keys or a gamepad.

![Touch the Dots running under manual control from the retained time](/help/branch-a-simulated-try/driving.png)

7. Click **Stop Try** to save the alternative beside its source.
8. In **Library**, open either saved try to replay it.

![The source and alternative saved as separate tries](/help/branch-a-simulated-try/saved.png)

Use a supported arm, rover or joint drive. You can play back older recordings.

If you change the Case, robot or source recording, you need a new scripted recording. You can’t use continuation checkpoints with routine, policy and code controllers.

You have the same time limit as the original recording. The result includes failures before the checkpoint, even if you reach the goal in the new ending.

To move a branch and its available parents to another Library, open its timeline and click **Export Try**. Drop the resulting `.tries.zip` file onto Basecase to import it. You need the matching robot scene to replay it.

![Both tries restored through the imported portable file](/help/branch-a-simulated-try/imported.png)

You can play back a branch with a missing parent. Restore the parent before using that branch in a dataset to keep its shared beginning in one split.

To use the keyboard, choose **Branch Try** or **Export Try** in [[⌘K]]. For the original recording workflow, see [Try a Case](/help/try-a-case).
