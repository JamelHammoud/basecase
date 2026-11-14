---
title: Label tries and their segments
date: 2026-11-14
image: /changelog/label-tries-and-their-segments/cover.png
---

Every try now splits into labeled segments, like reach, grasp and lift. You can also tag tries and mark them passed or failed.

The segments show up in a lane above the joints on the try timeline.

Say you drove a two-minute pick-and-place session. Until now it stayed one long piece with no labels, and a policy learns better from steps that have words. Now it opens as reach, grasp, lift, carry, place and release, and each segment names the block.

## Where It Splits

Basecase finds the boundaries for you. A new segment starts when the gripper closes or opens, when the hand touches or lifts a named object, or after a pause longer than 0.3 s. A Case's stages and named inputs, such as a wave, mark boundaries too.

Real and imported tries split only on the gripper and on pauses.

## Fix It by Hand

Drag an edge to move it. Press S to split a segment and ⌫ to merge, and rename a segment in place. You can undo each edit.

## Tag and Judge Tries

Tag… in a try's menu tags one try, or 50 at once.

Mark Passed and Mark Failed only label a try that hasn't been judged. A try from a Case keeps its verdict.

## The Agent and Your Datasets

The agent's `label_tries` tool reads tries with their filmstrips and writes an instruction for each try and each segment.

Export Dataset writes the segments as LeRobot subtasks and GR00T annotations.

Read [Label a try](/help/label-a-try) in the help center for the steps.
