---
title: Scrub a try on the timeline
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 5
keywords:
  - replay a try
  - play back
  - joint effort
  - try timeline
  - plot
  - loop
  - playback speed
related:
  - run-a-case
  - try-a-case
covers:
  - src/components/simulate/TryTimeline.tsx
  - src/components/simulate/TimelineLane.tsx
  - src/components/simulate/useTimelineKeys.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useTryTimeline.ts
  - src/workspace/useTimelinePlayback.ts
  - src/workspace/useConsolePlayback.ts
  - src/cases/console/recordedSignals.ts
  - src/components/caseRun/panels/
  - src/sim/recordedFrames.ts
  - src/cases/tripFrames.ts
  - src/workspace/useCaseRun.ts
---

Play a recorded try through its Case's panels, and step through it frame by frame to see what each joint did.

1. Open a Case and record a try with **Try It** in the Simulate tab.
2. In Results, click the play button on the try's row. The Case opens running, with every panel showing the try and the timeline under the canvas.

![A try in Results with its play button](/help/scrub-a-try-on-the-timeline/results.png)

3. Click or drag on a plot to go to that moment. The numbers, the map, the cameras and the robot on the canvas follow.

![Touch the Dots running a try at 2.7 s, with the playhead on the Joints plot and on each lane of the timeline](/help/scrub-a-try-on-the-timeline/playing.png)

4. Press [[Space]] to play the try from there.
5. Hold [[⇧]] and drag across a lane of the timeline to play that range over and over.

![The timeline with a looped range shaded on every lane](/help/scrub-a-try-on-the-timeline/loop.png)

6. Click **Done** or press [[Esc]] to go back to the live robot. The Case keeps running.

Plots draw the whole try with a line at the playhead, and the map draws the robot's whole path. Press [[[]] or [[]]] to play slower or faster, from ¼× to 4×. [[→]] or [[←]] moves one frame (1/50 s), and [[⇧]] with them moves a second. [[Home]] and [[End]] go to the start and the end. [[⇧]]-click a lane to stop looping.

Each lane is one joint. Its top plot is the joint's position in blue over its target in gray, and its bottom one is its effort, with the servo's limit dashed. Effort reads in N·m, or in N for a sliding joint. Red lines mark where the Case's failure checks tripped, and the timeline opens on the first one.

Click in a lane to select the joint's link on the canvas. It stays selected when you leave the Case, ready to change in the Inspector.

In a running Case, the play button on a try in its tries panel does the same.

A try recorded before you added or removed a joint doesn't open. The agent can read a try the same way and answer questions about it; see [Agent tools](/help/agent-tools).
