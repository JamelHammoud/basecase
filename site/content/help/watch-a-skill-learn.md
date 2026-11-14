---
title: Watch a skill learn while it trains
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
related:
  - train-stand-and-walk-with-the-motor-kit
  - arena
covers:
  - src/workspace/useTrainingWatch.ts
  - src/workspace/watchSubject.ts
  - src/skills/liveWatch.ts
  - src/skills/snapshots.ts
  - src/components/simulate/SkillsList.tsx
  - forge/crates/forge-train/src/trainer.rs
---

While Forge trains a skill, you can watch each snapshot of it run on the canvas. Once the skill passes Arena, you can replay any of them.

**Note:** Snapshots need the desktop app. If you train in the browser, you see only the training progress.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, click **Train** on a skill, such as **Stand**.
3. Keep the Simulate tab open. After each 15 seconds of training, the robot on the canvas switches to the newest snapshot.
4. Watch the robot start over every 8 seconds. If a skill's test runs longer, the robot waits longer before it starts over.
5. Check the number beside the row. It shows how far that run cleared the skill's contract, and any number above zero is a pass.

![Stand training at 33%, with +1.55 beside it and the quadruped on the canvas](/help/watch-a-skill-learn/training.png)

6. Wait for the Arena line to appear on the row. The snapshots stay under it, labeled with the training iteration they came from.
7. To run a snapshot in the simulation, click it.

![Stand ready, with six snapshots from 50 to 300 under its Arena line](/help/watch-a-skill-learn/snapshots.png)

If Arena refuses a Motor Kit skill, the skill and its snapshots aren't kept. Instead, its row shows how close it came, such as "Refused in Arena: 20 of 32 tries".

When you stop training or open another tab, Basecase puts back the controller you had before.

A skill keeps at most 12 snapshots, spread evenly over its training. To learn what the contract checks, see [Arena](/help/arena).
