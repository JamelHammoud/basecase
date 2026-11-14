---
title: Pick up a block
date: 2026-11-13
image: /changelog/pick-up-a-block/cover.png
---

Arms with a gripper have a new Case goal, Pick Up a Block. While you drive, Space closes the gripper, so you can lift a block and set it down on a spot.

## Where it is

Click New Case in **Play** ▸ **Cases**. Pick Up a Block shows up in the Goal list when the arm ends in two fingers that close together, each on its own joint.

For an arm without a gripper, the goal isn't in the list. If you open a Pick Up a Block Case on one, the Case says it needs a gripper.

![New Case with Pick Up a Block chosen, and its Distance, Spacing, Radius and Time](/changelog/pick-up-a-block/new-case.png)

The Case puts a block on the floor ahead of the arm, sized to 70% of the gripper's opening. A blue spot sits farther out on the same line. Distance starts at 40% of the arm's reach and Spacing at 25%. With another arm in the Case, the world scales to that arm's reach.

## Driving it

Click Try It in the Simulate tab. W A S D move the hand and Q E raise and lower it, as before. On an arm with a gripper, the hand is the point between the fingers.

The gripper stays pointing down, so it comes down over the block from above. Hold Space, or a gamepad's first button, and the fingers close. Let go and they open.

![The arm carrying the block toward the spot](/changelog/pick-up-a-block/cover.png)

## What counts

A try passes when the block rises by more than half its size, then ends with its center within Radius of the spot. If you shove the block along the floor onto the spot, the try fails, because the block never left the floor.

The Case's reference runs the whole pick by itself: it moves above the block, comes down, grips, lifts, carries, lowers and releases.

![Results with a passed Pick Up a Block try](/changelog/pick-up-a-block/results.png)

Passed tries export as LeRobot datasets like any other Case's, with "Pick up the block and set it on the spot." as the task.

## What it doesn't do yet

A gripper that is a single catalog part, with no finger joints, isn't a gripper in the simulation, because nothing on it can close. The block also always sits straight ahead of the arm on an open floor.

Read [Pick up a block with a gripper](/help/pick-up-a-block-with-a-gripper) in the help center for the steps.
