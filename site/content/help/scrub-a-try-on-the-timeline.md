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
covers:
  - src/components/simulate/TryTimeline.tsx
  - src/components/simulate/TimelineLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
---

Step through a Case try one frame at a time to see what each joint was asked to do, where it went, and how hard its servo worked.

1. Open a Case, then record a try with **Try It** in the Simulate tab.
2. In Results, click the play button on the try's row.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The timeline opens below the canvas, with one lane for each joint. Each lane has two plots:
   - The top plot shows the joint's position in blue over its target in gray.
   - The bottom plot shows its effort in N·m (or N for a sliding joint), with the servo's limit as a dashed line.

   Red lines mark where the Case's failure checks tripped, and the timeline opens at the first one.
4. Use the keyboard to move the playhead. The robot on the canvas follows it.
   - To move one frame (1/50 s), press [[→]] or [[←]].
   - To move one second, hold [[⇧]] while you press [[→]] or [[←]].
   - To go to the start or end, press [[Home]] or [[End]].
   - To play or pause, press [[Space]].
5. To jump to a spike, click it in a lane. Basecase selects the joint's link on the canvas so you can change it.

![The timeline under the canvas, with the second joint's link selected](/help/scrub-a-try-on-the-timeline/timeline.png)

6. To close the timeline, press [[Esc]].

When the timeline opens, Basecase recalculates effort from the recording, so its peaks match Peak torque in Results.

A try recorded before you added or removed a joint won't open. To open a try from another scene, use the Library ([Open a try from any scene](/help/open-a-try-from-any-scene)). A try you open from a search result opens at the result's start instead of the first red line. See [Search tries](/help/search-tries).
