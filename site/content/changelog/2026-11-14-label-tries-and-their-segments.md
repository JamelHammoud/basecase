---
title: Label tries and their segments
date: 2026-11-14
image: /changelog/label-tries-and-their-segments/cover.png
---

Every try now opens on the timeline split into labeled segments, such as reach block, grasp block and lift block. You can also tag tries and mark an unjudged try passed or failed.

Say you drove a two-minute pick-and-place session. It stayed one long recording with no words in it, and a policy learns better from steps that have them. Now it opens as reach, grasp, lift, carry, place and release, and each segment names the block.

Basecase starts a new segment where the gripper closes or opens, where the hand touches or lifts a named object, and after a pause of 0.3 s or more. A Case's stages and named inputs, such as a wave, cut segments too. Real, imported and Operate tries split only on the gripper and on pauses. On the timeline you can move, split, merge, rename and tag segments, and undo each edit.

Tag… in a try's menu tags that try, or every try you've selected. A Case in the scene judges an imported or Operate try when its goal reads only what the try recorded. Mark Passed and Mark Failed label a try no Case judged, and never change a Case's verdict.

The agent's `label_tries` tool reads tries with their filmstrips and writes an instruction for each try and each segment. Export Dataset writes the segments as LeRobot 0.7 subtasks and GR00T annotations.

Steps are in [Label a try](/help/label-a-try).
