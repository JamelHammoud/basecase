---
title: Design a robot from a motion
date: 2026-11-13
image: /changelog/design-a-robot-from-a-motion/cover.png
---

You can now start a robot from a motion clip and get the fewest joints that replay it, with a servo picked for each.

Run Design From Motion in ⌘K, or drop a BVH on a scene with no robot, and give the robot's height. A first robot often starts from a move it must make, like a wave. Nobody can tell from the clip whether that arm needs two joints or five.

Basecase measures how far each bone's turns move the end of its limb. It adds joints one at a time, the biggest mover first, until IK on the chain follows every end through every frame. The tolerance is 1% of the height. A wave gets a shoulder and an elbow, and a trotting quadruped gets a hip and a knee on each leg.

Each joint's range is the clip's sweep plus 10%. Each servo holds its joint at the joint's fastest speed in the clip, so a fast joint gets a fast servo. The 2 s wave fits in about 40 ms, in a worker, and lands in one undo step with Edit Skeleton open.

Only BVH files are read. The clip's body is the robot's base, so walking or turning the whole body isn't fitted. When a limb can't follow the clip, the sheet names it and nothing is placed. The agent fits skeletons the same way with its `skeleton_from_motion` tool.

Steps are in [Design a robot from a motion](/help/design-a-robot-from-a-motion).
