---
title: Design a robot from a motion
date: 2026-11-13
image: /changelog/design-a-robot-from-a-motion/cover.png
---

You can now start a robot from a motion clip. Basecase gives you the fewest joints that replay it, with a servo picked for each one.

Run Design From Motion in ⌘K, or drop a BVH on a scene with no robot, then give the robot's height.

## Only the Joints It Needs

A first robot often starts from a move it has to make, like a wave, and the clip alone doesn't tell you whether the arm needs two joints or five.

Basecase adds joints one at a time, starting with the one that moves the most, and stops once the chain follows the clip within 1% of the robot's height. A wave gets a shoulder and an elbow.

Each servo holds its joint at the fastest speed that joint reaches in the clip.

Basecase fits the 2 s wave in about 40 ms, and the result lands as one undo step with Edit Skeleton open.

The agent fits skeletons the same way, with its `skeleton_from_motion` tool.

## What It Doesn't Fit

Basecase reads only BVH files. It doesn't fit walking or turning the whole body.

When no servo is fast or strong enough for a joint, a message names that joint.

Read [Design a robot from a motion](/help/design-a-robot-from-a-motion) in the help center for the steps.
