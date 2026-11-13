---
title: Edit a robot as a stick figure
date: 2026-11-13
image: /changelog/edit-a-robot-skeleton/cover.png
---

You can now lay out a robot as joints and bones in the Pose tab and drag a hip or a knee by the millimeter. Each servo's torque margin changes as you drag, before the agent builds a single part.

## Where it is

Run Edit Skeleton from ⌘K, or turn on the Edit Skeleton switch in the Skeleton section at the top of the Pose tab. The Pose tab now shows for any scene with a skeleton, not only for a robot with joints. In an empty scene the section offers Arm and Biped. They come from the same templates the agent builds from: a 4-joint desk arm, or two legs with hip roll, hip pitch, knee and ankle. Every joint is on a Feetech STS3215.

The camera frames the figure when it appears.

![A biped skeleton on the canvas, with each joint's margin in the Pose tab](/changelog/edit-a-robot-skeleton/biped.png)

## Dragging

Drag a joint ball and that joint moves with everything below it, in 1 mm steps (Shift moves freely). Hold ⌥ to move only that joint, so the bones on both sides stretch or shrink. The matching joint on the other side follows the mirror way. Parts the agent placed on a joint follow it, and ⌘Z undoes the whole drag at once.

![Both knees after dragging the left one down 20 mm with ⌥](/changelog/edit-a-robot-skeleton/dragged.png)

## Margins and servos

Each joint shows how much of its servo's stall torque is left at its hardest load, standing or holding the limb out. It shows as a percentage next to its name and as the ball's color: green, amber or red, like Checks. It's the same sizing the agent's `size_actuators` runs on a skeleton. Click a joint and the menu offers the next stronger servo on the same bus. On the biped's knee that's the STS3250, which takes it from 88% to 93%.

![Clicking the left knee offers the Feetech STS3250](/changelog/edit-a-robot-skeleton/servo-menu.png)

## What it doesn't do

Moving a joint doesn't rebuild the parts around it. A thigh you lengthen by 20 mm leaves a 20 mm gap until you ask the agent to rebuild it. Margins come from the skeleton's estimated mass and link lengths, not the finished model. Once parts exist, Checks in the Build tab give the real numbers.

Steps are in [Shape a robot as a stick figure](/help/edit-a-robot-skeleton).
