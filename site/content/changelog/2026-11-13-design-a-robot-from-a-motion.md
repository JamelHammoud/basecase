---
title: Design a robot from a motion
date: 2026-11-13
image: /changelog/design-a-robot-from-a-motion/cover.png
---

You can now start a robot from a motion clip. Basecase gives you the fewest joints that replay it, with a servo picked for each one.

Run Design From Motion in ⌘K, or drop a BVH on a scene with no robot, and give the robot's height.

A first robot often starts from a move it has to make, like a wave. Nobody can tell from the clip whether that arm needs two joints or five.

## Fewest Joints

Basecase measures how far each bone's turns move the end of its limb. Then it adds joints one at a time, starting with the biggest mover, until IK on the chain follows every end. It checks up to 240 frames spread over the clip, with a tolerance of 1% of the height.

A wave gets a shoulder and an elbow. A trotting quadruped gets a hip and a knee on each leg.

## A Servo for Each Joint

Each joint's range is the clip's sweep plus 10%. Each servo holds its joint at the fastest speed that joint reaches in the clip.

Fitting the 2 s wave takes about 40 ms, and it runs in a worker. The result lands as one undo step, with Edit Skeleton open.

## What Doesn't Fit

Basecase reads only BVH files. The clip's body is the robot's base, so walking or turning the whole body isn't fitted.

When a limb can't follow the clip, the sheet names it and nothing is placed. When no servo is fast or strong enough for a joint, that joint gets the strongest one, and a message names it.

The agent fits skeletons the same way with its `skeleton_from_motion` tool.

Read [Design a robot from a motion](/help/design-a-robot-from-a-motion) in the help center for the steps.
