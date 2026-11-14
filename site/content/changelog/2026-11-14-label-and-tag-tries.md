---
title: Label and tag tries
date: 2026-11-14
image: /changelog/label-and-tag-tries/cover.png
---

You can now see every try split into named subtasks on its timeline, fix the splits by hand, and tag tries.

Until now, a two-minute try reached a dataset as one task. Policies and vision-language-action models learn better from steps in words, like reach, grasp, lift and place the block. In labeling tools you mark those frames by hand, one at a time. Basecase marks them from what it already knows about the try.

## How a Try Splits

A try splits where the gripper closes or opens. While an object is held, it also splits when the object rises 5 mm, when it moves 10 mm, and when it comes down. A pause of 0.3 s splits it too, and so do a Case's stages and named events, like a wave gesture. The same try always splits the same way.

The reference try for Pick Up a Block on the six-joint arm splits into reach, grasp, lift, carry, place and release, with the block named in each subtask. Real tries split only on the gripper and on pauses.

## Fix and Tag

Split, merge, move and rename segments on the timeline, and undo any edit.

Right-click a try for Tag, Mark Passed and Mark Failed. You can't mark over a Case's verdict.

## Export

Export Dataset writes each frame's subtask for LeRobot and GR00T. To load the new datasets, LeRobot needs version 0.7 or later.

The agent labels tries too, with its `label_tries` tool.

Read [Label the segments of a try](/help/label-the-segments-of-a-try) in the help center for the steps.
