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

You can step through a Case try one frame at a time. For each joint, the timeline shows its target, where it went, and how hard its servo worked.

1. Open a Case, then click **Try It** in the Simulate tab to record a try.
2. In Results, click the play button in the row for the try.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The timeline opens below the canvas, with one lane for each joint. Each lane has two plots:
   - The top plot shows the joint's position in blue, drawn over its target in gray.
   - The bottom plot shows the joint's effort in N·m, or in N for a sliding joint. A dashed line marks the servo's limit.

   Red lines mark where the Case's failure checks tripped. The timeline opens at the first one.
4. Move the playhead with your keyboard. The robot on the canvas moves with it.
   - To move one frame (1/50 s), press [[→]] or [[←]].
   - To move one second, press and hold [[⇧]] while you press [[→]] or [[←]].
   - To go to the start or the end, press [[Home]] or [[End]].
   - To play or pause, press [[Space]].
5. To jump to a spike, click it in a lane. Basecase selects that joint's link on the canvas, so you can change it.

![The timeline under the canvas, with the second joint's link selected](/help/scrub-a-try-on-the-timeline/timeline.png)

6. To close the timeline, press [[Esc]].

**Note:** When the timeline opens, Basecase recalculates effort from the recording, so its peaks match Peak torque in Results.

Tries with the **Operate** badge open from the **Library** in the same timeline. Their lanes show what the robot measured. Effort comes from the robot if it reports effort, and Basecase recalculates it if it doesn't. If your camera was on, its video plays to the left of the lanes, at the playhead. See [Record a robot session as a try](/help/record-a-robot-session-as-a-try).

A try won't open if you added or removed a joint after you recorded it. To open a try from another scene, use the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).
