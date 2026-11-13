---
title: Scrub a try on the timeline
date: 2026-11-13
covers:
  - src/components/simulate/TryTimeline.tsx
  - src/components/simulate/TimelineLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
---

Step through a Case try frame by frame to see what each joint was asked to do, where it went and how hard its servo worked.

1. Open a Case and record a try with **Try It** in the Simulate tab.
2. In Results, click the play button on the try's row.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. The timeline opens under the canvas with one lane per joint. The top plot is the joint's position in blue over its target in grey; the bottom one is its effort in N·m, with the servo's limit dashed. Red lines mark where the Case's failure checks tripped, and the timeline opens on the first one.
4. Press → or ← to move one frame (1/50 s), and hold ⇧ to move a second. Home and End go to the start and the end, and Space plays and pauses. The robot on the canvas follows the playhead.
5. Click a spike in a lane to jump there. The joint's link is selected on the canvas, ready to change.

![The timeline under the canvas, with the second joint's link selected](/help/scrub-a-try-on-the-timeline/timeline.png)

6. Press Esc to close it.

The effort is worked out again from the recording when the timeline opens, so its peaks match Peak torque in Result. A try recorded before you added or removed a joint doesn't open.
