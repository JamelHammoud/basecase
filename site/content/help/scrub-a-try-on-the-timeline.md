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
  - src/components/simulate/TryVideo.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
---

You can step through a Case try one frame at a time. For each joint, the timeline shows the target, the position the joint reached, and how hard its servo worked.

1. Open a Case, then click **Try It** in the Simulate tab to record a try.
2. In Results, find the row for the try and click its play button.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The timeline opens below the canvas, with one lane for each joint. Each lane has two plots:
   - The top plot shows the joint's position in blue, drawn over its target in gray.
   - The bottom plot shows the joint's effort in N·m, or in N for a sliding joint. A dashed line marks the servo's limit.

   Red lines mark where the Case's failure checks tripped. The timeline opens at the first red line.
4. To move the playhead, use these keys. The robot on the canvas moves with it.
   - To move one frame (1/50 s), press [[→]] or [[←]].
   - To move one second, press and hold [[⇧]] while you press [[→]] or [[←]].
   - To go to the start or the end, press [[Home]] or [[End]].
   - To play or pause, press [[Space]].
5. To jump to a spike, click it in a lane. Basecase selects that joint's link on the canvas, so you can change it.

![The timeline under the canvas, with the second joint's link selected](/help/scrub-a-try-on-the-timeline/timeline.png)

6. To close the timeline, press [[Esc]].

**Note:** When the timeline opens, Basecase recalculates effort from the recording, so the peaks you see match Peak torque in Results.

Tries with the **Operate** badge open in the same timeline from the **Library**. Their lanes show what the robot measured. The timeline uses the effort the robot reports, and Basecase recalculates it when the robot doesn't report any. If your camera was on, its video plays to the left of the lanes and stays at the playhead. See [Record a robot session as a try](/help/record-a-robot-session-as-a-try).

A try won't open if you added or removed a joint after you recorded it. To open a try from another scene, use the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).
