---
title: Compare saved tries
date: 2026-11-17
collection: simulate-and-train
type: task
order: 18
related:
  - import-robot-data-as-tries
  - open-a-try-from-any-scene
covers:
  - src/cases/comparison/
  - src/workspace/useSavedTimeline.ts
  - src/workspace/useTryTimeline.ts
  - src/workspace/useTriesView.ts
  - src/workspace/datasetCommands.tsx
  - src/components/tries/TriesHeader.tsx
  - src/components/simulate/ComparisonSource.tsx
  - src/components/simulate/SavedTimelinePanel.tsx
hub_open_a_try_from_any_scene: |
  Select two recordings and [Compare saved tries](/help/compare-saved-tries) on one timeline, with separate signals, cameras and source clocks.
hub_open_a_try_from_any_scene_order: 30
---

Compare two recorded runs at the same moment without driving a robot or changing either recording.

1. In **Library**, click a robot under **Tries**.
2. Hold [[⌘]] and click two recorded tries.
3. Click **Compare Tries**.

![Before.mcap and after.mcap with separate signals and state lanes at elapsed time zero](/help/compare-saved-tries/elapsed.png)

4. In each source's **Align Event** menu, choose the recorded event to place at the shared cursor.

![Both recordings aligned at their trigger transitions, with offsets of minus one and minus two seconds](/help/compare-saved-tries/aligned.png)

5. Drag the timeline slider to inspect both sources at another moment.
6. In each source's **Signal** menu, choose the numeric channel to compare.
7. Click **Compare Signals** to overlay the selected channels and show their difference.
8. Click **Close** to return to Tries.

![The original before.mcap recording reopened with its own values and camera](/help/compare-saved-tries/original.png)

After selecting the recordings, you can press [[⌘K]] and choose **Compare Tries**.

You start with both recordings aligned by elapsed time. Use **Offset** to shift a source by a specific amount, or choose **Elapsed time** to reset one source.

You can see the source time below each identity. Expand the source heading to inspect its robot, model, policy and original hashes.

To compare differences, select channels with compatible known units. Use **Previous sample** to set the maximum sample age in seconds. Basecase does not use numerical interpolation for states or events.

You can see distinct statuses for missing, stale, clipped and outside-range samples. Each recording must be under 64 MB.

You can view cameras and spatial layers in separate source panels. In spatial previews, you see each frame's local XY plane. Basecase does not register coordinates between robots.

For imported recordings without joints, you don't need a scene robot. See [Import robot data as tries](/help/import-robot-data-as-tries).
