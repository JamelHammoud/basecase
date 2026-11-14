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

See each snapshot of a skill run on the canvas while Forge trains it, then replay any of them once the skill passes Arena.

Snapshots need the desktop app. Training in the browser shows its progress only.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, click **Train** on a skill, such as **Stand**.
3. Keep the Simulate tab open. Every 15 seconds of training, the robot on the canvas switches to the newest snapshot.
4. Watch the robot start over every 8 seconds, or longer for a skill whose test runs longer.
5. Read the number beside the row. It's how far that run cleared the skill's contract, above zero for a pass.

![Stand training at 33%, with +1.55 beside it and the quadruped on the canvas](/help/watch-a-skill-learn/training.png)

6. Wait for the row's Arena line. The snapshots stay under it, labeled with their training iteration.
7. Click a snapshot to run it in the simulation.

![Stand ready, with six snapshots from 50 to 300 under its Arena line](/help/watch-a-skill-learn/snapshots.png)

A Motor Kit skill that Arena refuses isn't kept, and neither are its snapshots. Its row says how close it came instead, such as "Refused in Arena: 20 of 32 tries".

Stopping training or opening another tab puts back the controller you had before. A skill keeps at most 12 snapshots, spread evenly over its training. [Arena](/help/arena) explains what the contract checks.
