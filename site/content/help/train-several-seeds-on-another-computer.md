---
title: Train several seeds on another computer
date: 2026-11-15
collection: simulate-and-train
type: task
covers:
  - src/components/settings/TrainingPane.tsx
  - src/skills/seedSelection.ts
  - src/skills/seedDevelopment.ts
  - electron/remoteTraining/group.mjs
  - electron/remoteTraining/seeds.mjs
---

You can share a skill's training budget across seeds and return one candidate for local checking.

Before you begin, [connect a Linux training computer](/help/train-on-another-computer) in the desktop studio.
You can use up to 4 attempts and run up to 2 trainers at once. The default is one attempt.
Grouped attempts don’t publish live training snapshots.

1. Press [[⌘,]] to open **Settings**.
2. In **Settings**, choose **Training**.
3. In **Attempts**, choose the number of seeds.
4. In **Concurrent attempts**, choose how many trainers can run at once.
5. Click **Connect** to save the choices for new runs.

![Training settings with two attempts and two concurrent attempts](/help/train-on-another-computer/settings.png)

6. Close **Settings**.
7. In the scene's **Simulate** tab, click **Train** beside the skill.

![Stand showing aggregate progress for two training attempts](/help/train-on-another-computer/training.png)

The attempts share the configured time and iteration budgets. If you increase the number of attempts, each seed gets less training work.
After all attempts finish, the studio uses development evaluation to select one candidate, then runs its usual local checks and Arena.
For cloning, the studio uses validation loss from the frozen dataset. For other skills, it uses a nominal rollout of their task contract, separate from Arena's sealed variants.

If you close the studio, reopen the same scene to recover the workflow. The studio keeps completed child attempts marked as completed.
Use Stop to record cancellation for each child, including while disconnected.
If training or the selected candidate fails, the studio keeps the retained skill. If you change the design, the studio refuses the old result.
