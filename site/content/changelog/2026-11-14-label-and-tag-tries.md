---
title: Label and tag tries
date: 2026-11-14
image: /changelog/label-and-tag-tries/cover.png
---

You can now see every try split into named subtasks on its timeline. Fix the splits by hand, and tag tries for your datasets.

Until now, a two-minute try reached a dataset as one task. Policies and vision-language-action models learn better from steps in words, such as reach, grasp, lift and place the block. In labeling tools you mark those frames by hand, one at a time. Basecase marks them from what it already knows about the try.

## How a Try Splits

The gripper closing and opening is one boundary. A held object rising 5 mm, moving 10 mm and coming down are three more. A pause of 0.3 s counts too, and so do a Case's stages and named events, like a wave gesture. The same try always splits the same way.

The reference try for Pick Up a Block on the six-joint arm splits into reach, grasp, lift, carry, place and release, and each subtask names the block. Real tries split only on the gripper and on pauses.

## Fix and Tag

On the timeline, press [[S]] to split a segment, or [[⌫]] to merge it into the one before.

Tags, Mark Passed and Mark Failed are in each try's right-click menu. You can't mark over a Case's verdict.

## Export

Export Dataset writes each frame's subtask for LeRobot and GR00T. LeRobot needs version 0.7 or later to load the new datasets.

The agent labels tries too, with its `label_tries` tool.

Read [Label the segments of a try](/help/label-the-segments-of-a-try) in the help center for the steps.
