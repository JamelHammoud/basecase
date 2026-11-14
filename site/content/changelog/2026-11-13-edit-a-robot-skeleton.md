---
title: Edit a robot as a stick figure
date: 2026-11-13
image: /changelog/edit-a-robot-skeleton/cover.png
---

You can now lay out a robot as joints and bones in the Pose tab and drag a hip or a knee by the millimeter. Each servo's torque margin changes as you drag, before the agent has built any parts.

## Where it is

Run Edit Skeleton from ⌘K, or turn on the Edit Skeleton switch in the Skeleton section at the top of the Pose tab. Until now, the Pose tab only showed up for a robot with joints. Now it shows up for any scene with a skeleton.

In an empty scene, the section offers Arm and Biped, from the same templates the agent builds from. Arm is a 4-joint desk arm. Biped is two legs with hip roll, hip pitch, knee and ankle. Every joint is on a Feetech STS3215.

The camera frames the figure when it appears.

![A biped skeleton on the canvas, with each joint's margin in the Pose tab](/changelog/edit-a-robot-skeleton/biped.png)

## Dragging

Drag a joint ball and that joint moves in 1 mm steps, along with everything below it. Hold Shift to move it freely.

Hold ⌥ to move only that joint, and the bones on both sides of it stretch or shrink to follow.

The matching joint on the other side mirrors the move, and parts the agent placed on a joint move with it. ⌘Z undoes the whole drag in one step.

![Both knees after dragging the left one down 20 mm with ⌥](/changelog/edit-a-robot-skeleton/dragged.png)

## Margins and servos

Each joint shows how much of its servo's stall torque is left at its hardest load, standing or holding the limb out. You see it as a percentage next to the joint's name and in the color of its ball: green, amber or red, like in Checks. It's the same sizing the agent's `size_actuators` runs on a skeleton.

Click a joint and the menu offers the next stronger servo on the same bus. On the biped's knee that's the STS3250, which takes the margin from 88% to 93%.

![Clicking the left knee offers the Feetech STS3250](/changelog/edit-a-robot-skeleton/servo-menu.png)

## What it doesn't do

Moving a joint doesn't rebuild the parts around it. Lengthen a thigh by 20 mm and you get a 20 mm gap until you ask the agent to rebuild it.

Margins come from the skeleton's estimated mass and its link lengths. Once the robot has parts, Checks in the Build tab give the real numbers.

Read [Shape a robot as a stick figure](/help/edit-a-robot-skeleton) for the steps.
