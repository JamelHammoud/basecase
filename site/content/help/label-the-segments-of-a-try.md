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

Basecase finds the subtasks in a try, such as grasp the block. You can check and fix them, then tag the try for your dataset.

1. In Results, click the play button on the try's row.
2. On the top lane of the timeline, click a segment. This selects it and moves the playhead to its start.

![The timeline with its segment lane: reach, grasp, lift, carry, place and release the block, then idle](/help/label-the-segments-of-a-try/timeline.png)

3. To move where one segment ends and the next begins, drag the edge between them.
4. To split the segment under the playhead in two, press [[S]].
5. To merge the selected segment into the one before it, press [[⌫]].
6. To rename a segment, double-click it.
7. Type the new name, then press [[↩]].
8. Right-click the try's row, then choose **Tag**.

![The try's right-click menu with Tag…](/help/label-the-segments-of-a-try/menu.png)

9. Type a tag, such as slow grasp, then press [[↩]].

![The Tag sheet with slow grasp typed](/help/label-the-segments-of-a-try/tag.png)

To label a try from another scene, open it from **Library** ▸ **Tries**. To tag a single segment, right-click the segment and choose **Tag**.

Basecase names each segment from what the robot did: the gripper closing and opening, a held object rising, moving and coming down, and pauses.

While the timeline is open, press [[⌘Z]] to undo a segment edit or [[⇧⌘Z]] to redo it. Basecase saves every edit with the try as you make it.

To tag several tries at once, select them in **Library** ▸ **Tries**, then right-click one of them. If no Case judged a try, the same menu also has **Mark Passed** and **Mark Failed**. A try that a Case judged keeps its verdict, and those two options don't appear.

Export Dataset writes segment names and tags into its files as each frame's subtask. The agent can also read and write them with its `label_tries` tool.
