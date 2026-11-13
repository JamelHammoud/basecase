---
title: Pick up a block with a gripper
date: 2026-11-13
collection: simulate-and-train
type: task
order: 3
covers:
  - src/cases/pickGoal.ts
  - src/cases/gripper.ts
  - src/sim/driveGrip.ts
  - src/components/cases/NewCaseCard.tsx
---

Make a Case where an arm lifts a block off the floor and sets it on a spot, then drive it yourself or record tries for a dataset.

1. Open a scene with an arm whose last joint carries two fingers, each on its own joint that slides or swings toward the other, with a range that lets it close.
2. Open Play ▸ Cases and click **New Case**.
3. Choose **Pick Up a Block**. It's listed only for an arm with a gripper like that.

![New Case with Pick Up a Block chosen, and its Distance, Spacing, Radius and Time](/help/pick-up-a-block-with-a-gripper/new-case.png)

4. Set **Distance** (how far ahead of the arm the block sits), **Spacing** (from the block to the spot), **Radius** (how close to the spot counts) and **Time**, then click **Create**. The block is sized to fit between the open fingers.
5. In the Simulate tab, click **Try It**.
6. Move the hand over the block with W A S D and lower it with E. The gripper points down with its fingers either side of the block while you drive.
7. Hold Space to close the gripper, raise the block with Q, carry it over the spot, lower it and let go of Space. A gamepad's first button grips too.

![The arm carrying the block toward the blue spot](/help/pick-up-a-block-with-a-gripper/carry.png)

8. Click **End Try**, or let the time run out. The try passes when the block left the floor on the way and its centre ends within Radius of the spot. Pushing it there doesn't count.

![Results with a passed try](/help/pick-up-a-block-with-a-gripper/results.png)

Passed tries can go out with Export Dataset or Publish to Hugging Face, with the Case's brief as the task.
