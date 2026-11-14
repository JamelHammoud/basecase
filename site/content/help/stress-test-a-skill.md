---
title: Stress-test a skill to find where it breaks
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
  - Train on These
related:
  - arena
  - coach-a-skill
covers:
  - src/skills/stress.ts
  - src/skills/stressSearch.ts
  - src/skills/stressTrain.ts
  - src/skills/stressWords.ts
  - src/skills/skillsStress.ts
  - src/components/simulate/SkillFindings.tsx
  - src/components/simulate/skillMenu.tsx
  - src/workspace/useSkillStress.ts
  - src/workspace/stressCommands.tsx
  - src/workspace/agentStressRequests.ts
  - electron/cad-mcp/skillTools.mjs
---

A stress test finds the friction, payload, servo strength and delay at which a ready skill stops passing. You can then retrain the skill to cover them.

1. Open the **Simulate** tab and find the ready skill under **Train**.
2. Right-click the skill's row, then choose **Stress**.

![The right-click menu of a ready Stand row with Stress](/help/stress-test-a-skill/menu.png)

3. Wait while the row shows its progress. A search takes about 10 seconds for Stand and about 25 seconds for Walk.
4. Read the findings under the row's Arena result. Each finding is a limit and the worst margin found past it, for example **Strength < 76%**. A margin below 0 fails.

![A Stand row with two findings and Train on These](/help/stress-test-a-skill/findings.png)

5. To replay a finding's run in the simulation under that finding's physics, click the finding.
6. To retrain the skill on the findings, click **Train on These**.

The search runs the skill with friction from ×0.2 to ×1.5, link mass from ×0.5 to ×2, servo strength from 40% to 120% and servo delay from 0 to 150 ms. It tries each one alone, then all four together, and judges every run by the skill's own contract. If a row has no findings, the skill held everywhere inside those limits.

**Train on These** widens the skill's training ranges to cover the failing values, then trains from the skill as it is now. The new version replaces the old one only if [Arena](/help/arena) passes it on the wider ranges. Otherwise the old skill stays, and the row shows how Arena refused it. **Train on These** works on Stand, Walk, Get up and Settle.

Findings aren't saved with the scene. The replay's physics stay in place until you press **Reset** or start another run, such as **Try** or **Drive**.

You can also use [[⌘K]]: **Stress Stand** runs the search, and **Train Stand on These** retrains. Or ask the agent something like “Will Walk hold up on tile?”
