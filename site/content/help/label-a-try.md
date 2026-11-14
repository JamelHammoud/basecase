---
title: Label a try
date: 2026-11-14
collection: simulate-and-train
type: task
order: 7
keywords:
  - segments
  - subtasks
  - tag tries
  - mark passed
  - language annotations
  - quality flags
related:
  - scrub-a-try-on-the-timeline
  - search-tries
  - export-a-lerobot-dataset
covers:
  - src/components/simulate/SegmentLane.tsx
  - src/components/simulate/FlagMark.tsx
  - src/components/simulate/useSegmentUndo.ts
  - src/components/tries/TriesMode.tsx
  - src/components/tries/useTagTries.ts
  - src/workspace/useTryLabels.ts
  - src/workspace/tagTries.ts
  - src/cases/tryLabels.ts
  - src/datasets/segments.ts
---

You can split a try into labeled steps, such as reach, grasp and lift, and tag a try and mark it passed or failed. When you make a dataset from your tries, it can teach each step in words.

1. Click **Replay** on a try in **Results**, or click a try in **Library** ▸ **Tries**.

The try opens on the timeline, with its segments in the lane above the joints. Each segment is named for what the robot did and the object it touched.

![The timeline with reach, grasp, lift, carry, place and release segments above the joint lanes](/help/label-a-try/segments.png)

2. To change where a segment ends, drag the edge between two segments.
3. To split a segment, click where it should split, then press [[S]].
4. To merge a segment into the one before it, click it, then press [[⌫]].
5. To rename a segment, double-click it, type the new name, then press [[↩]].
6. To tag a try, right-click it and choose **Tag…**. Type the tags with commas between them, then press [[↩]].

![A try's right-click menu in Results with Tag… above Multiply and Delete](/help/label-a-try/menu.png)

- To undo a segment change, press [[⌘Z]] while the timeline has focus.
- To tag several tries at once, choose them in **Tries**.
- To tag only one step, right-click its segment and choose **Tag…**.

## Mark a try passed or failed

A try from a Case keeps that Case's verdict.

A Case in the scene judges an imported try if the Case's goal reads only what the try recorded, such as Touch a Point. Otherwise the try stays unjudged, and you can mark it yourself with **Mark Passed** or **Mark Failed**.

## How Basecase finds segments

Basecase finds a try's segments automatically the first time the try opens. It splits the try:

- Where the gripper closes or opens
- Where the hand touches or lifts an object
- Where the robot pauses for 0.3 s
- At each stage of the Case
- At named inputs, such as a wave

For real and imported tries, Basecase splits only where the gripper closes or opens and where the robot pauses.

## Warning marks

An amber warning mark beside the segments flags any of these:

- A joint at its limit
- Missing frames
- Torque over the servo's limit
- More than 2 s of standing still
- A try from an earlier design

Point at the mark to see when it happened.

## Use your labels in a dataset

The agent can write an instruction for each try and each segment from its filmstrip. [Export Dataset](/help/export-a-lerobot-dataset) writes the segments as LeRobot subtasks and as GR00T annotations.
