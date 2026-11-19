---
title: Plan an arm reach
date: 2026-11-18
collection: simulate-and-train
type: task
related:
  - teach-a-robot-a-skill
  - arena
covers:
  - src/skills/armMotion.ts
  - src/skills/armConfiguration.ts
  - src/skills/armMotionTrial.ts
  - src/skills/raceIk.ts
  - src/skills/anythingArm.ts
---

Move a fixed-base arm to a reachable target while planning around fixed Case obstacles.

Start with the arm and its Case open. You can’t plan a reach with moving obstacles, closed mechanisms or missing collision geometry.

1. Click **Simulate**.
2. Under **Train**, in **Teach it to**, describe the target and obstacle.

![The Teach it to field requests a reach around the divider](/help/plan-an-arm-reach/prompt.png)

3. Click **Teach**.
4. In **Agent**, read the target and passing conditions.
5. Reply to approve the contract.
6. Click **Simulate**.

![The saved reach row has Arena evidence and a Try button](/help/plan-an-arm-reach/ready.png)

7. Beside the saved reach, click **Try**.

![The arm reaches the other side of the divider in simulation](/help/plan-an-arm-reach/reached.png)

A clear endpoint doesn’t prove that the arm can get there. The planner checks intermediate configurations and transitions, then tests the candidate path in physical simulation. You need Arena to retain the skill.

The planner has a fixed search budget. If it reports that it found no motion within that budget, a path may exist.

For an unobstructed reach, the planner keeps the direct path. You can use the same saved animation format and **Try** control for a searched path.

For the contract workflow, see [Teach a robot a skill](/help/teach-a-robot-a-skill). For the evidence behind a retained result, see [Arena](/help/arena).
