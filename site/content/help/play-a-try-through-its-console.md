---
title: Play a try through its console
date: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - replay a try
  - playback
  - playhead
  - playback speed
  - loop a range
  - console
related:
  - run-a-case
  - scrub-a-try-on-the-timeline
covers:
  - src/workspace/useCaseRun.ts
  - src/workspace/CaseRunProvider.tsx
  - src/workspace/useRecordedSignals.ts
  - src/cases/console/recordedSignals.ts
  - src/components/caseRun/panels/PlotPanel.tsx
  - src/components/caseRun/panels/MapPanel.tsx
  - src/components/caseRun/panels/ListPanel.tsx
  - src/components/simulate/TryTimeline.tsx
  - src/workspace/useTimelinePlayback.ts
  - src/workspace/timelinePlayback.ts
---

Watch a recorded try in its Case's own cards, with the cameras, numbers, plots and map showing each moment as it happened.

1. Run the Case, as in [Run a Case](/help/run-a-case).
2. Click **Try It** and drive the robot.
3. Click **Stop Try**, or let the clock run out. The try appears under Results.

![A running Case with its cameras on the left, and Base, Joints, Map and a passed try under Results on the right](/help/play-a-try-through-its-console/tries.png)

4. Click **Replay** on the try's row. The cards show the try at the playhead, and the timeline opens under the canvas.
5. Click or drag on a plot to move the playhead. The robot, the cameras, the numbers and the timeline follow.

![Touch the Dots playing a try at 2.1 s, with the wrist camera, the Base value and the arm at that moment, and the playhead on the Joints plot and the timeline](/help/play-a-try-through-its-console/console.png)

6. Press [[Space]] to play or pause.
7. Press [ or ] to play slower or faster, from 0.25× to 4×. The speed button beside the slider shows the speed.
8. Hold [[⇧]] and drag across a lane of the timeline to loop that part. Playing repeats it until you hold [[⇧]] and click a lane.

![A loop band across the timeline's lanes, with the playhead inside it](/help/play-a-try-through-its-console/loop.png)

9. Click **Done** or press [[Esc]] to stop playing. You're back in the running Case.

You can also play a try with **Replay** in Results in the Simulate tab, or by clicking its tile in **Library** ▸ **Tries**. When you stop playing, you're back where you were.

Plots show the whole try, with a line at the playhead. The map draws the whole path the robot took, with a dot where it is at the playhead. A try whose Case isn't in this scene plays through the default cards: the cameras, the brief, the failures, the servos and the tries.

A try plays only if it fits the robot as it is now, so a try recorded before you added or removed a joint won't open. Tries from a real robot don't play. While a try plays, the buttons in the cards are off and Try It is hidden. A try records the drive's command but not which input sent it, so every input shows that same command.

The agent can read a try too. Ask it what happened in one, and it reads the try's signals, its failures with their times, and the canvas at one moment.

To see each joint's target and effort frame by frame, see [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline). To find tries from other scenes, see [Open a try from any scene](/help/open-a-try-from-any-scene).
