---
title: Scrub a try on the timeline
date: 2026-11-13
collection: simulate-and-train
type: task
order: 5
keywords:
  - replay a try
  - joint effort
  - try timeline
covers:
  - src/components/simulate/TryTimeline.tsx
  - src/components/simulate/TimelineLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
---

You can step through a Case try frame by frame to see where each joint was told to go, where it went, and how hard its servo worked.

1. Open a Case, then record a try with **Try It** in the Simulate tab.
2. In Results, click the play button on the try's row.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The timeline opens under the canvas, with one lane for each joint. Red lines mark where the Case's failure checks tripped, and the timeline opens on the first one. Each lane has two plots:
   - Top: the joint's position in blue over its target in gray.
   - Bottom: the joint's effort in N·m (or N for a sliding joint), with the servo's limit as a dashed line.
4. Move through the try with the keyboard. The robot on the canvas follows the playhead.
   - To move one frame (1/50 s), press [[→]] or [[←]].
   - To move one second, hold [[⇧]] while you press [[→]] or [[←]].
   - To go to the start or the end, press [[Home]] or [[End]].
   - To play or pause, press [[Space]].
5. Click a spike in a lane to jump to that point. This also selects the joint's link on the canvas, so you can change it right away.

![The timeline under the canvas, with the second joint's link selected](/help/scrub-a-try-on-the-timeline/timeline.png)

6. To close the timeline, press [[Esc]].

When the timeline opens, it recalculates effort from the recording, so its peaks match Peak torque in Results.

**Note:** If you added or removed a joint after you recorded a try, that try doesn't open.
