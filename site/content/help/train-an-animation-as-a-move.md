---
title: Train an animation as a move
date: 2026-11-13
updated: 2026-11-14
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

You can train a legged robot to perform one of its animations under physics, such as a sit, a bow, or a dance step. Without training, the sim plays the animation as joint targets and the robot tips over.

1. Give the robot an animation in the Pose tab. Choose **+** ▸ **Walk Cycle** or **+** ▸ **Import BVH**, or ask the agent to animate it.
2. Open the Simulate tab. Under Teach it to, find the row with the animation's name, after Stand, Walk, Get up, and Settle.
3. Click Train on that row. Forge learns a policy that follows the animation. While it trains, the row shows the trainer's message and how much of its time Forge has used, and the robot on the canvas runs the newest snapshot. See [Watch a skill learn while it trains](/help/watch-a-skill-learn).
4. Wait while the row shows Checking in Arena… Arena runs the move 96 times with randomized friction, masses, servo strength, and delays. To pass, the joints must stay with the animation, and the robot must not fall or wander off.
5. Once the row shows its Arena result (for example, 32 of 32 tries), click Try to play the move in the sim from the start.

If a move fails Arena, Basecase discards it. The row tells you why, and you can click Train again.

Basecase trains one skill at a time. If you click Train on another row while a skill is training, a message names the skill to stop first.

A move that doesn't loop holds its last pose for 2 s. Basecase judges a looping move over two rounds.

If you edit the animation, its row goes back to Train. A robot fixed to the ground gets none of these rows, and its animations play as they are.

You can use a ready move as a step in a Routine. To publish a move, right-click it in the desktop app and choose **Publish to Hugging Face**. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

To switch from Walk into the move, you first need a proof. See [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).
