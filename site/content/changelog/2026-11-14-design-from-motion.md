---
title: Design from motion
date: 2026-11-14
image: /changelog/design-from-motion/cover.png
---

You can now start a robot from a BVH motion clip, with joint frames, ranges and a catalog servo per joint. This creates the skeleton and servos, without body parts or physics playback.

Choose **Design From Motion** in [[⌘K]] and enter a height in mm. Dropping a BVH into an empty scene opens the same sheet.

A waving arm needs enough joints to follow its wrist path, while each servo must keep up with the clip. The fit searches the observed rotation axes for the fewest joints per endpoint path that stay within 2 mm at every frame. It scales link lengths to the chosen height and adds 10% of each fitted joint's span at both range ends.

The shared servo picker checks speed and acceleration alongside estimated loads. It checks the result again using the chosen servos' catalog masses. A path or joint it can’t fit is named, and nothing is placed.

The result opens in Edit Skeleton with its margins showing. One undo removes the skeleton and its servos together.

Read [Design a robot from a motion clip](/help/design-a-robot-from-motion) for the steps.
