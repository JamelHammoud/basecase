---
title: Label and tag tries
date: 2026-11-14
image: /changelog/label-and-tag-tries/cover.png
---

You can now see every try split into named subtasks on its timeline, fix the splits by hand, and tag tries.

Until now, a two-minute try reached a dataset as one task. Policies and vision-language-action models learn better from steps put into words, like reach, grasp, lift and place the block. Labeling tools have you mark those frames by hand, one at a time. Basecase marks them for you from what it already knows about the try.

## How a Try Splits

A try splits where the gripper closes or opens. While an object is held, it also splits when the object rises 5 mm, when it moves 10 mm, and when it comes down. A Case's stages and named events, like a wave gesture, split it too. On an arm without a gripper, or on a legged robot, a pause of 0.3 s splits it. The same try always splits the same way.

Take Pick Up a Block on the six-joint arm. Its reference try splits into reach, grasp, lift, carry, place and release, and each subtask names the block. Real tries split only on the gripper and on pauses.

## Fix and Tag

You can split, merge, move and rename segments on the timeline, and undo any edit. You can tag one try or many at once, and tag a single segment. Tags stay in Basecase and aren't exported.

## Export

Export Dataset writes the subtask of each frame, for LeRobot and GR00T. LeRobot needs version 0.7 or later to load the new datasets.

The agent labels tries too, with its `label_tries` tool.

Read [Label the segments of a try](/help/label-the-segments-of-a-try) in the help center for the steps.
