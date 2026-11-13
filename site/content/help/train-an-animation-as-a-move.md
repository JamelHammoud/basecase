---
title: Train an animation as a move
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/skills/moves.ts
  - src/skills/moveEnvironment.ts
  - src/skills/raceTracking.ts
  - src/skills/skillRows.ts
  - src/components/simulate/SkillsList.tsx
  - src/workspace/useSkills.ts
---

Teach a legged robot to perform one of its animations, a sit, a bow or a dance step, under physics instead of tipping over when the sim plays it as joint targets.

1. Give the robot an animation in the Pose tab: + ▸ Walk Cycle, + ▸ Import BVH, or ask the agent to animate it.
2. Open the Simulate tab. Under Teach it to, the animation has its own row with its name, after Stand, Walk, Get up and Settle.
3. Click Train on that row. Forge learns a policy that follows the animation, and the row shows the trainer's message and how much of the time is used.
4. Wait for Checking in Arena. Arena runs the move 96 times on randomized friction, masses, servo strength and delays, and it passes only if the joints stay with the animation and the robot doesn't fall or wander off.
5. Click Try once the row shows its Arena result, such as 32 of 32 tries. The move plays in the sim from the start.

A move that doesn't loop holds its last pose for 2 s, and a looping one is judged over two rounds. Editing the animation puts its row back to Train. Robots fixed to the ground don't get these rows: their animations play as they are.

A ready move is also a step in a Routine. Switching into it from Walk needs a proof first; see [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).
