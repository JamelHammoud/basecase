---
title: Design a robot from a motion clip
date: 2026-11-14
image: /changelog/design-a-robot-from-a-motion-clip/cover.png
---

You can now start a robot from the motion it has to perform. Basecase fits a skeleton with the fewest joints that replay a BVH clip and picks a servo for each joint.

Run Design From Motion from ⌘K, or drop a `.bvh` file on a scene with no robot, and enter the robot's height.

Say you want a desk robot that waves. You can't tell whether its arm needs two joints or four, or which servo keeps up with the wave.

Each limb gets the fewest revolute joints that keep every point of it within 1% of the robot's height on every frame. A limb that holds still gets none. Ranges cover the clip plus 10% on each side. Each servo is the cheapest catalog servo that holds its joint and turns faster than the clip's peak speed there, so a faster clip gets faster servos. A 2-second wave fits in about 20 ms in a worker and lands as one undo step, with Edit Skeleton open on it.

The fit reads BVH files only, and nothing checks that the robot can perform the clip under physics. The body between the hips and the chest gets no joints.

The agent fits skeletons the same way, with its `skeleton_from_motion` tool.

Steps are in [Design a robot from a motion clip](/help/design-a-robot-from-a-motion-clip).
