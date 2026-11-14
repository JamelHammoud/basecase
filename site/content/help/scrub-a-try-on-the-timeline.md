---
title: Scrub a try on the timeline
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - replay a try
  - joint effort
  - try timeline
  - playback speed
  - loop a range
covers:
  - src/components/simulate/TryTimeline.tsx
  - src/components/simulate/TimelineLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/workspace/useTimelinePlayback.ts
  - src/workspace/timelinePlayback.ts
  - src/workspace/useCaseRun.ts
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
---

You can step through a Case try one frame at a time. For each joint, you can see what it was asked to do, where it went, and how hard its servo worked.

1. Open a Case, then record a try with **Try It** in the Simulate tab.
2. In Results, click **Replay** on the try's row.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The Case's console fills the window, and its cards show the try at the playhead. The timeline opens below the canvas, with a lane for each joint. Each lane has two plots:
   - The top plot shows the joint's position in blue over its target in gray.
   - The bottom plot shows its effort in N·m (or N for a sliding joint). The dashed line is the servo's limit.

   Red lines mark where the Case's failure checks tripped. The timeline opens at the first one.
4. Move the playhead with your keyboard. The robot on the canvas follows it.
   - To move one frame (1/50 s), press [[→]] or [[←]].
   - To move one second, hold [[⇧]] and press [[→]] or [[←]].
   - To go to the start or end, press [[Home]] or [[End]].
   - To play or pause, press [[Space]].
   - To play slower or faster, from 0.25× to 4×, press [ or ].
5. To jump to a spike, click it in a lane. Basecase selects that joint's link on the canvas.

![The Touch the Dots console around the canvas, with the timeline under the arm at 2.4 s](/help/scrub-a-try-on-the-timeline/timeline.png)

6. To loop part of the try, hold [[⇧]] and drag across a lane. To remove the loop, hold [[⇧]] and click a lane.
7. To close the timeline, click **Done** or press [[Esc]]. You return to the Simulate tab.

When the timeline opens, Basecase recalculates effort from the recording, so its peaks match Peak torque in Results.

For more on the cards around the canvas, see [Play a try through its console](/help/play-a-try-through-its-console).

You can't open a try that you recorded before you added or removed a joint. To open a try from another scene, use the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).
