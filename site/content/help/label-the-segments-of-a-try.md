---
title: Label the segments of a try
date: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - segments
  - subtasks
  - annotate
  - tags
  - labels
  - language instructions
related:
  - scrub-a-try-on-the-timeline
  - open-a-try-from-any-scene
covers:
  - src/components/simulate/SegmentLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/tries/TagSheet.tsx
  - src/workspace/useSegmentEdits.ts
  - src/workspace/useTryLabelling.ts
  - src/datasets/segments.ts
  - src/cases/tryLabels.ts
---

Basecase finds the subtasks in a try, like grasp the block, and shows each one as a segment. You can check the segments, fix any that are wrong, then tag the try.

1. In **Results**, click the play button on the try's row.
2. Click a segment on the top lane of the timeline. Basecase selects the segment and moves the playhead to its start.

![The timeline with its segment lane: reach, grasp, lift, carry, place and release the block, then idle](/help/label-the-segments-of-a-try/timeline.png)

3. To change where one segment ends and the next one begins, drag the edge between them.
4. Press [[→]] until the playhead reaches the frame where you want to split the segment.
5. Press [[S]]. The segment splits at that frame.
6. To merge the selected segment into the one before it, press [[⌫]].
7. To rename a segment, double-click it.
8. Type the new name, then press [[↩]].
9. Right-click the try's row, then choose **Tag**.

![The try's right-click menu with Tag](/help/label-the-segments-of-a-try/menu.png)

10. Type a tag, such as slow grasp, then press [[↩]].

![The Tag sheet with slow grasp typed](/help/label-the-segments-of-a-try/tag.png)

While the timeline is open, you can press [[⌘Z]] to undo a segment edit, or [[⇧⌘Z]] to redo it. Basecase saves each edit with the try as you make it, so you don't need to save.

To label a try from another scene, open it from **Library** ▸ **Tries**.

To tag a single segment instead of the whole try, right-click the segment and choose **Tag**. To tag several tries at once, select them in **Library** ▸ **Tries**, then right-click one of them.

Basecase names each segment after what the robot did. It looks for when the gripper closes and opens, when a held object rises, moves and comes down, and for pauses.

The agent can also read and write these labels with its `label_tries` tool. Export Dataset writes each segment's name as the subtask for its frames. If the agent gave a segment an instruction, the export writes that instruction in place of the name. Tags stay in Basecase and aren't exported.
