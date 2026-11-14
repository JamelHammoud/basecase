---
title: Retrain an out-of-date policy
date: 2026-11-12
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 8
keywords:
  - retrain
  - out of date
  - stale policy
  - recalibrate
related:
  - teach-a-robot-a-skill
  - run-a-trained-skill-on-the-emulated-robot
covers:
  - src/components/simulate/PolicyList.tsx
  - src/components/SimulatePanel.tsx
  - src/sim/policyFreshness.ts
  - src/sim/mjcfFingerprint.ts
  - src/sim/useTraining.ts
---

If you change the robot a policy learned on, train the policy again so it runs on the robot you have now.

1. Open the Simulate tab and scroll to Train. A policy shows Out of date if you've changed its robot since it last trained: a resized link, a different mass or servo, or a new servo calibration from Operate.
2. Right-click the policy, then choose Retrain. Basecase trains it again with the same task, speed, and training time, and the policy keeps its name.
3. While the policy trains, its row shows the trainer's message, how much of the training time it has used, and a stop button. Meanwhile, the robot on the canvas runs the newest snapshot of the policy.

![Two policies marked Out of date in Train](/help/retrain-an-out-of-date-policy/out-of-date.png)

![The policy's right-click menu with Retrain and Delete](/help/retrain-an-out-of-date-policy/retrain.png)

![Walk 1 training again, with a stop button on its row](/help/retrain-an-out-of-date-policy/retraining.png)

Until Basecase saves the new policy in its place, the old one stays and keeps running. If you stop training, you get back the controller you had before.

Moving the robot across the floor, posing it, or adding scenery doesn't make a policy out of date. If you roll a calibration back in Operate to the one a policy trained on, that policy is current again.
