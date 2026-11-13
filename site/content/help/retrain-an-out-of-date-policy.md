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

Train a policy again after you change the robot it learned on, so it runs on the robot you have now.

1. Open the Simulate tab and scroll to Train. A policy shows Out of date when its robot changed since it was trained: a resized link, a different mass or servo, or a new servo calibration from Operate.
2. Right-click the policy and choose Retrain. It trains again with the same task, speed and training time, and keeps its name.
3. Watch the row while it trains: the trainer's message, how much of the time is used, and a stop button. The old policy stays and still runs until the new one is saved in its place.

![Two policies marked Out of date in Train](/help/retrain-an-out-of-date-policy/out-of-date.png)

![The policy's right-click menu with Retrain and Delete](/help/retrain-an-out-of-date-policy/retrain.png)

![Walk 1 training again, with a stop button on its row](/help/retrain-an-out-of-date-policy/retraining.png)

Moving the robot across the floor, posing it or adding scenery doesn't make a policy out of date. Rolling a calibration back in Operate to the one a policy trained on makes it current again.
