---
title: Train Stand and Walk with the Motor Kit
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 8
keywords:
  - motor kit
  - locomotion
  - gait
  - get up
  - settle
  - velocity tracking
  - walking policy
  - teach it to move
  - metal
  - gpu
related:
  - teach-a-robot-a-skill
  - arena
covers:
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/TrainSection.tsx
  - src/components/simulate/ControlSection.tsx
  - src/skills/motorKit.ts
  - src/skills/skillRows.ts
  - src/workspace/useSkills.ts
  - electron/trainer.mjs
  - electron/kitScheduler.mjs
  - forge/crates/forge-train/src/trainer.rs
---

Give a robot with legs its four basic skills, Stand, Walk, Get up and Settle, trained and proved in Arena without writing a goal.

The Motor Kit is for robots that stand on their own legs. Training runs in the desktop app, and uses every core while it runs.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, find **Stand**, **Walk**, **Get up** and **Settle**.
3. Click **Train** on the skill you want.
4. Wait while the row shows the trainer's message and a progress bar.
5. When the row shows its Arena line, such as "32 of 32 tries, at least 91%", click **Try** to run it in the simulation.
6. For **Walk**, click **Drive** instead, and steer with [[W A S D]].

To stop training, click **Stop training** (■) on the row. **Teach It to Move**, under **Control**, trains **Walk** too.

## How long it takes

Measured on an M5 Pro Mac:

| Skill | Four or six legs | Two legs |
|---|---|---|
| **Stand** | About 2 minutes | 8 to 12 minutes |
| **Walk** | About 19 minutes | About 28 minutes |

When the first try fails Arena, Walk trains again from its best result. It can then take up to 30 minutes on four or six legs, and 45 on two.

On a Mac with Apple silicon, Stand and Walk train on the GPU. On Windows they train on the CPU instead, and the times above don't apply.

## What Walk can do

Walk follows a speed and a turn you command. Its top speed is 0.2 m/s on four or more legs and 0.15 m/s on two. Driving it, forward goes up to the top speed, sideways up to a quarter of it, and turns up to 0.6 rad/s.

## One job at a time

One training job runs at a time across the whole app, and others wait their turn. Training you start comes first: it pauses any Motor Kit job retraining in the background, which says "Paused for other training. Starts again after it."

## After you change the design

1.5 seconds after an edit, Basecase checks each Motor Kit skill you've trained against the new design. A colour or name change keeps it ready. A mass or size change runs Arena again in the background, with no training. A joint change trains it again. Skills you never trained don't start on their own.

To see what Arena checks, read [Arena](/help/arena). To teach anything else, see [Teach a robot a skill](/help/teach-a-robot-a-skill).
