---
title: Pick up a block
date: 2026-11-13
image: /changelog/pick-up-a-block/cover.png
---

Arms with a gripper get a new Case goal, Pick Up a Block. Space closes the gripper while you drive, so you can lift a block and set it on a spot.

## Where it is

Click New Case in Play ▸ Cases. Pick Up a Block is in the Goal list when the arm ends in two fingers on their own joints that close together. Steps are in [Pick up a block with a gripper](/help/pick-up-a-block-with-a-gripper). An arm without one doesn't see it, and a Pick Up a Block Case opened on such an arm says it needs a gripper.

![New Case with Pick Up a Block chosen, and its Distance, Spacing, Radius and Time](/changelog/pick-up-a-block/new-case.png)

The Case puts a block on the floor ahead of the arm, sized to 70% of the gripper's opening. A blue spot sits farther out on the same line. Distance and Spacing start at 40% and 25% of the arm's reach, and the whole world scales with reach when another arm takes the Case.

## Driving it

Click Try It in the Simulate tab. W A S D move the hand and Q E raise and lower it, as before. On an arm with a gripper, the hand is the point between the fingers. The gripper stays pointing down, so it comes down over the block instead of into it. Hold Space, or a gamepad's first button, to close the fingers, and let go to open them.

![The arm carrying the block toward the spot](/changelog/pick-up-a-block/cover.png)

## What counts

A try passes when the block rises by more than half its size, then ends with its center within Radius of the spot. Shoving it along the floor onto the spot fails, because it never leaves the floor. The Case's reference does the whole thing on its own: above the block, down, grip, lift, carry, lower, release.

![Results with a passed Pick Up a Block try](/changelog/pick-up-a-block/results.png)

Passed tries export as LeRobot datasets like any other Case's, with "Pick up the block and set it on the spot." as the task.

## What it doesn't do yet

A gripper that is a single catalog part, with no finger joints, isn't a gripper in the simulation, since nothing on it can close. The block always sits straight ahead of the arm on an open floor.
