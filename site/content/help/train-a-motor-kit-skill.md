---
title: Train a Motor Kit skill
date: 2026-11-12
collection: simulate-and-train
type: task
covers:
  - src/components/simulate/TrainSection.tsx
  - src/components/simulate/SkillsList.tsx
  - src/workspace/useSkills.ts
  - src/skills/skillsPlatform.ts
  - src/forge/tabSupport.ts
---

Teach a legged robot to stand, walk, get up or settle, and have Arena check the result before you use it. It works in the desktop app and at app.basecase.so, where it trains on your own GPU in Chrome or Edge.

1. Open a scene with a legged robot and click **Simulate** at the top of the right panel.
2. Find the **Train** section. It lists Stand, Walk, Get up and Settle.

![The Train section with Stand, Walk, Get up and Settle](/help/train-a-motor-kit-skill/rows.png)

3. Click **Train** beside the skill you want. The row shows what's happening and how far along it is. The square beside it stops the run.

![Stand training at 25%](/help/train-a-motor-kit-skill/training.png)

4. Wait for Arena. When the skill passes, the row shows its worst run, such as "32 of 32 tries, at least 91%", and a **Try** button. Walk shows **Drive** instead.
5. Click **Try** to run the skill in the simulation.

![Stand ready, with its Arena line and Try](/help/train-a-motor-kit-skill/ready.png)

A skill that doesn't pass isn't kept, and its row offers Train again. In the browser, the trained skill is saved with the scene in that browser, so it's still there after a reload. If the browser can't train (no WebGPU), the Train section doesn't appear. The desktop app also retrains skills on its own after you change the robot, and lets you teach new ones by typing a goal; the browser trains only when you press Train.
