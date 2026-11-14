---
title: Label and tag tries
date: 2026-11-14
image: /changelog/label-and-tag-tries/cover.png
---

You can now see every try split into named subtasks on its timeline, fix them by hand, and tag tries for your datasets.

A two-minute try used to reach a dataset as one task. Policies and vision-language-action models learn better from steps in words, such as reach, grasp, lift and place the block. Labeling tools mark those frames by hand, one at a time.

Basecase marks them from what it already knows about the try. The gripper closing and opening is one boundary. A held object rising 5 mm, moving 10 mm and coming down are three more. A pause of 0.3 s, a Case's stages and named events such as a wave gesture also count. The same try always splits the same way.

Pick Up a Block's reference try on the six-joint arm splits into reach, grasp, lift, carry, place and release, each naming the block. Real tries use the gripper and pauses only.

On the timeline, [[S]] splits a segment and [[⌫]] merges it into the one before. Tags, Mark Passed and Mark Failed are in each try's right-click menu. A Case's verdict can't be marked over. Export Dataset writes each frame's subtask for LeRobot and GR00T, and the agent labels tries with its `label_tries` tool.

Steps are in [Label the segments of a try](/help/label-the-segments-of-a-try).
