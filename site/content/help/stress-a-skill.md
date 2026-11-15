---
title: Stress a skill to find where it breaks
date: 2026-11-14
collection: simulate-and-train
type: task
keywords:
  - stress
  - stress test
  - robustness
  - friction
  - payload
  - servo delay
  - domain randomization
  - train on these
related:
  - arena
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/skills/stress.ts
  - src/skills/stressProbe.ts
  - src/skills/stressTrain.ts
  - src/skills/stressWords.ts
  - src/skills/skillsStress.ts
  - src/sim/livePhysics.ts
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/skillMenu.tsx
  - src/workspace/useSkillStress.ts
  - src/workspace/stressCommands.tsx
  - src/workspace/agentStressRequests.ts
  - electron/cad-mcp/skillTools.mjs
hub_the_design_agent_order: 20
hub_the_design_agent: |
  - Ask whether a ready skill holds up on a slicker floor or while carrying a load. It answers with the values where the skill starts to fail.
---

Find the friction, weight, servo strength or servo delay where a ready skill starts to fail, then retrain it on those values.

1. Open the **Simulate** tab and find the ready skill under **Train**.
2. Right-click its row, then choose **Stress**.

![The right-click menu of a ready Stand row with Stress at the top](/help/stress-a-skill/menu.png)

3. Wait while the row reads Stressing with a percentage. It takes about 20 seconds for Stand. To stop early, click **Stop training** (■) on the row.

![The Stand row reading Stressing 4%, with a progress bar and a stop button](/help/stress-a-skill/stressing.png)

4. Read the findings under the row. Each one names a setting, the value where the skill starts to fail, and its worst margin.

![The Stand row with one finding, Link mass > ×1.58, margin −0.04](/help/stress-a-skill/findings.png)

5. Click a finding to watch that run in the simulation.
6. To retrain a Motor Kit skill on what failed, right-click its row and choose **Train on These**.

![The right-click menu of the stressed Stand row with Stress and Train on These](/help/stress-a-skill/train.png)

The new skill replaces the old one only if Arena passes it on the wider ranges. Otherwise, the old skill stays and the row shows how many tries passed, for example Refused in Arena: 28 of 32 tries. When the new skill is kept, its findings go away, and you can stress it again.

![The Stand row after Train on These, with its new Arena result and no findings](/help/stress-a-skill/trained.png)

Stress changes one setting at a time, then all of them together, and judges each run with the skill's own contract. The margin is how far a run was from failing: above 0 passes. It tests friction from ×0.2 to ×1.5 of the floor's grip, every link's mass from ×0.5 to ×2, servo strength from 40% to 120%, and servo delay from 0 to 150 ms. A skill that passes all of these shows no findings, only its Arena result.

Stress uses 48 runs, all from the same start pose, so stressing the same skill again gives the same findings. Train on These widens only the settings that failed, a little past where they failed, and trains from the skill as it is.

Train on These works on Motor Kit skills in the desktop app: Stand, Walk, Get up and Settle. Findings last until you close the scene or the skill changes. If a design change retrains the skill in the background, it trains on the usual ranges again.

You can also use [[⌘K]]: **Stress Stand** and **Train Stand on These** do the same as their menu items. You can ask the agent too, for example whether Walk holds up carrying a load, and it answers with the same numbers.

To learn how Arena judges a skill, see [Arena](/help/arena).
