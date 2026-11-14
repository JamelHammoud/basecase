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
  - src/cases/judgeTry.ts
---

Check and fix the subtasks Basecase finds in a try, such as grasp the block, then tag the try for your dataset.

1. In Results, click the play button on the try's row. A try from another scene opens from **Library** ▸ **Tries**.
2. The top lane of the timeline shows the try's segments. Basecase names each one from what the robot did: the gripper closing and opening, a held object rising, moving and coming down, and pauses.

![The timeline with its segment lane: reach, grasp, lift, carry, place and release the block, then idle](/help/label-the-segments-of-a-try/timeline.png)

3. Click a segment to select it and move the playhead to its start.
4. Drag the edge between two segments to move where one ends and the next begins.
5. Press [[S]] to split the segment under the playhead in two.
6. Press [[⌫]] to merge the selected segment into the one before it.
7. Double-click a segment, type a new name and press [[↩]].
8. Right-click the try's row and choose **Tag…**. A segment's right-click menu has **Tag…** too.

![The try's right-click menu with Tag…](/help/label-the-segments-of-a-try/menu.png)

9. Type a tag, such as slow grasp, and press [[↩]].

![The Tag sheet with slow grasp typed](/help/label-the-segments-of-a-try/tag.png)

Press [[⌘Z]] to undo a segment edit while the timeline is open, and [[⇧⌘Z]] to redo it. Every edit is saved with the try as you make it.

In **Library** ▸ **Tries**, select several tries and right-click one to tag them all at once. A try that no Case judged gets **Mark Passed** and **Mark Failed** in the same menu. A try a Case judged keeps its verdict, and those two don't show.

Segment names and tags go into the files Export Dataset writes, as each frame's subtask. The agent reads and writes them too, with its `label_tries` tool.
