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

You can set up a Case in which an arm picks a block up off the floor and puts it down on a spot. Then you can drive the arm yourself or record tries for a dataset.

1. Open a scene with an arm that has a gripper. The arm's last joint must carry two fingers, each on its own joint that slides or swings toward the other finger. The range of each finger joint must let the gripper close.
2. Open **Play** ▸ **Cases**, then click **New Case**.
3. Choose **Pick Up a Block**. This option appears only when the arm has a gripper like the one in step 1.

![New Case with Pick Up a Block chosen, and its Distance, Spacing, Radius and Time](/help/pick-up-a-block-with-a-gripper/new-case.png)

4. Set **Distance** (how far in front of the arm the block sits), **Spacing** (how far the spot is from the block), **Radius** (how close to the spot counts), and **Time**. Then click **Make Case**. Basecase sizes the block to fit between the open fingers.
5. In the Simulate tab, click **Try It**.
6. Use [[W A S D]] to move the hand over the block, then press [[E]] to lower it. While you drive, the gripper points down with a finger on either side of the block.
7. Hold [[Space]] to close the gripper, then press [[Q]] to raise the block. Carry it over the spot, lower it, and release [[Space]]. You can also grip with the first button on a gamepad.

![The arm carrying the block toward the blue spot](/help/pick-up-a-block-with-a-gripper/carry.png)

8. Click **Stop Try**, or wait for the time to run out. A try passes if the block leaves the floor at some point and its center ends up within Radius of the spot. Pushing the block onto the spot doesn't count.

![Results with a passed try](/help/pick-up-a-block-with-a-gripper/results.png)

To share the tries that passed, click **Make Dataset** under **Results**, then export or publish the dataset. The dataset uses the Case's brief as its task. To learn more, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
