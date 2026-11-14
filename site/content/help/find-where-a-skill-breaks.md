---
title: Find where a skill breaks
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - stress test
  - robustness
  - failure boundary
  - edge case
  - friction
  - slippery floor
  - payload
  - servo delay
  - latency
  - domain randomization
  - train on failures
related:
  - arena
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/skills/stress.ts
  - src/skills/stressBench.ts
  - src/skills/stressTraining.ts
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/ReadyActions.tsx
  - src/components/simulate/StressFindings.tsx
  - src/workspace/useSkillStress.ts
---

Find the friction, weight, servo strength and latency where a ready skill fails, past what Arena tried, and train it on them.

Train on These needs the desktop app, and only retrains Motor Kit skills and moves.

1. In **Simulate**, find a ready skill in the **Train** section. Its row shows its Arena result.
2. Click **Stress** on the row. The search runs up to 160 tries and takes about 15 seconds for Stand on a quadruped.
3. Read the findings under the row. Each gives the value where the skill starts failing, such as **Weight > ×1.94**, or a combination that fails, and the margin of its worst try.
4. Click a finding to replay its worst try in the live sim, under that friction, weight, strength and latency. The sim keeps them through **Reset** until you click **Stop simulation** or **Try**.
5. Click **Train on These** to retrain the skill with those values added to its training ranges.
6. Wait for Arena to judge the new skill on the wider ranges. It replaces the old one only if it passes; otherwise the old skill stays and a message gives Arena's count.

![A ready Stand row with a failing combination of friction, weight and strength, and Train on These](/help/find-where-a-skill-breaks/findings.png)

A row with no findings held across every limit: friction 0.2 to 1.5 times, weight 0.5 to 2 times, servo strength 40% to 120% and servo latency up to 150 ms.

You can also press [[⌘K]] and run **Stress Stand**, or ask the agent whether the skill holds on tile. For what Arena already checks, see [Arena](/help/arena).
