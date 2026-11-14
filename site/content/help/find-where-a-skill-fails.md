---
title: Find where a skill fails
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - stress
  - stress test
  - robustness
  - slippery floor
  - payload
  - servo delay
  - latency
  - Train on These
related:
  - arena
  - coach-a-skill
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/skills/stress.ts
  - src/skills/stressJudge.ts
  - src/skills/stressTrain.ts
  - src/skills/stressText.ts
  - src/skills/skillsStress.ts
  - src/sim/conditions.ts
  - src/sim/sim.worker.ts
  - src/components/simulate/StressFindings.tsx
  - src/components/simulate/skillMenu.tsx
  - src/workspace/useSkillStress.ts
  - src/workspace/skillCommands.tsx
  - src/workspace/agentStressRequests.ts
  - electron/cad-mcp/skillTools.mjs
---

Find the friction, weight, servo strength or servo delay where a ready skill stops passing, then train it to hold there.

1. Open the **Simulate** tab and find the ready skill under **Train**.
2. Right-click its row and choose **Stress**.

![The right-click menu of a ready Stand row with Stress](/help/find-where-a-skill-fails/menu.png)

3. Wait while the row reads **Stressing** with its progress. **Stop** ends it.

![The Stand row while it's stressed, with its progress and Stop](/help/find-where-a-skill-fails/stressing.png)

4. Read the findings under the row. Each names a condition and the value past which the skill fails, such as **Delay > 76 ms**. The number on the right is its margin at the worst value. A margin below zero means the skill failed.

![A Stand row with one finding, Delay over 76 ms, and Train on These](/help/find-where-a-skill-fails/findings.png)

5. Click a finding to replay that run on the canvas, under its conditions.

![Stand replaying on the canvas at 150 ms of servo delay, its finding highlighted under the row](/help/find-where-a-skill-fails/replay.png)

The conditions last until something else runs in the sim, such as Try, Drive, training or a Case.

6. Click **Train on These** to retrain the skill with those conditions added to its training.

The row keeps the new skill only if Arena passes it. Otherwise the old skill stays, and the row shows Arena's count under the findings.

![The Stand row ready again with a new skill and no findings](/help/find-where-a-skill-fails/retrained.png)

Stress tries one condition at a time, then all four together, in at most 96 runs. Its limits are friction ×0.2 to ×1.5, weight ×0.5 to ×2, servo strength 40% to 120% and servo delay 0 to 150 ms. Friction and weight are multiples of the robot's own. Each run is judged by the same contract [Arena](/help/arena) uses. A skill with no finding held everywhere in those limits.

Train on These works on Stand, Walk, Get up and Settle in the desktop app. Neither it nor Stress shows while another skill trains. Findings aren't saved with the scene, so they clear when the skill changes or the app restarts.

In [[⌘K]], **Stress Stand** does the same as the menu item. You can also ask the agent whether a skill will hold, such as "Will Walk hold on a slippery floor?". It stresses the skill and answers with the numbers.
