---
title: Replay a failing seed
date: 2026-11-14
collection: simulate-and-train
type: task
related:
  - make-a-case
  - scrub-a-try-on-the-timeline
covers:
  - src/workspace/useCaseTrails.ts
  - src/workspace/useTryTimeline.ts
  - src/cases/caseRuns.ts
  - src/cases/seedReplay.ts
  - src/three/viewport/caseTrails.ts
---

Find where a randomized Case run failed, then inspect its joint positions and effort at that moment.

1. In the **Build** tab, under Checks, click the Case's row.

![Reach a Spot with all 20 seeded paths on the canvas](/help/replay-a-failing-seed/trails.png)

2. On the canvas, click a red trail.

![A failed Reach a Spot seed open at its first trip on the joint timeline](/help/replay-a-failing-seed/timeline.png)

3. On the timeline, press [[←]] or [[→]] to inspect the frames around the failure.
4. Press [[Esc]] to close the replay.

Green trails passed, and red trails failed. An arm's trail follows its end effector. A ground robot's trail follows its base.

A trail is sampled ten times per second. Clicking a failed trail reruns that seed and opens its recording at the first failure marker. A run that only missed its goal opens at its final judged frame.

The replay stays temporary. It doesn’t add a saved try. Closing it restores the previous simulation world.

For playback controls and joint lanes, see [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).
