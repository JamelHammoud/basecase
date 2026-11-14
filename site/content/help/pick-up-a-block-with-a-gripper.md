---
title: Pick up a block with a gripper
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 3
covers:
  - src/cases/pickGoal.ts
  - src/cases/gripper.ts
  - src/sim/driveGrip.ts
  - src/components/cases/NewCaseCard.tsx
---

You can make a Case where an arm lifts a block off the floor and sets it down on a spot. Then you can drive the arm yourself, or record tries for a dataset.

1. Open a scene with an arm that has a gripper. The arm's last joint needs to carry two fingers, each on its own joint that slides or swings toward the other finger, with a range that lets the gripper close.
2. Open **Play** ▸ **Cases** and click **New Case**.
3. Choose **Pick Up a Block**. This option appears only for an arm with a gripper like the one in step 1.

![New Case with Pick Up a Block chosen, and its Distance, Spacing, Radius and Time](/help/pick-up-a-block-with-a-gripper/new-case.png)

4. Set **Distance** (how far in front of the arm the block sits), **Spacing** (the distance from the block to the spot), **Radius** (how close to the spot counts) and **Time**. Then click **Make Case**. Basecase sizes the block so it fits between the open fingers.
5. In the Simulate tab, click **Try It**.
6. Use [[W A S D]] to move the hand over the block, and [[E]] to lower it. While you drive, the gripper points down with a finger on either side of the block.
7. Hold [[Space]] to close the gripper. Raise the block with [[Q]], carry it over the spot, lower it, then release [[Space]]. You can also grip with the first button on a gamepad.

![The arm carrying the block toward the blue spot](/help/pick-up-a-block-with-a-gripper/carry.png)

8. Click **Stop Try**, or wait for the time to run out. The try passes if the block leaves the floor at some point and its center ends up within Radius of the spot, so pushing the block onto the spot doesn't count.

![Results with a passed try](/help/pick-up-a-block-with-a-gripper/results.png)

To share the tries that passed, click **Make Dataset** under **Results**, then export or publish the dataset. The dataset uses the Case's brief as its task. See [Make a dataset from tries](/help/make-a-dataset-from-tries).
