---
title: Train an animation as a move
date: 2026-11-13
updated: 2026-11-13
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

You can teach a legged robot to perform one of its animations, such as a sit, a bow or a dance step, under physics. Without training, the sim plays the animation as joint targets and the robot tips over.

1. Give the robot an animation in the Pose tab. Choose **+** ▸ **Walk Cycle** or **+** ▸ **Import BVH**. Or ask the agent to animate it.
2. Open the Simulate tab. Under Teach it to, the animation has its own row, listed by name after Stand, Walk, Get up and Settle.
3. Click Train on that row. Forge learns a policy that follows the animation. While it trains, the row shows the trainer's message and how much of the time is used, and the robot on the canvas runs the newest snapshot. To learn more, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).
4. Wait while the row shows Checking in Arena… Arena runs the move 96 times with randomized friction, masses, servo strength and delays. The move passes only if the joints stay with the animation and the robot doesn't fall or wander off.
5. When the row shows its Arena result, such as 32 of 32 tries, click Try. The move plays in the sim from the start.

A move that doesn't loop holds its last pose for 2 s, and a looping move is judged over two rounds. If you edit the animation, its row goes back to Train. Robots fixed to the ground don't get these rows, so their animations play as they are.

You can also use a ready move as a step in a Routine. To find the friction, weight or servo limits where the move fails, right-click it and choose **Stress**. See [Find where a skill fails](/help/find-where-a-skill-fails). In the desktop app, right-click the move and choose **Publish to Hugging Face**. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face). To switch into the move from Walk, you first need a proof. See [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).
