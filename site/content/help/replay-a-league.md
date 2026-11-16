---
title: Replay a League
date: 2026-11-15
collection: simulate-and-train
type: task
related:
  - share-a-robot-as-a-link
  - compare-two-robots-on-a-case
covers:
  - src/leagues/
  - src/gallery/GalleryReplayControls.tsx
hub_run_a_case_order: 50
hub_run_a_case: |
  Compare shared robots on one pinned Case and replay their measured seeds. See [Replay a League](/help/replay-a-league).
---

Compare shared robots on one Case and open a measured run in your browser’s studio.

1. Open the [Rover sprint League](https://app.basecase.so/l/rover-sprint).
2. Under **Robot**, click a robot’s name.
3. Under **Seed**, click a seed number.
4. Click **Replay Seed**.

![Rover sprint standings with a selected robot and measured seeds](/help/replay-a-league/board.png)

5. Under **Provisional replay**, read the passed verdict or failed contract line.
6. Click **Play** to watch the run.

![A rover’s failed seed with its contract line and replay controls](/help/replay-a-league/replay.png)

7. Click **Open Scene** to keep the robot and its Case in the studio.

![The selected League robot and Case restored in the browser’s studio](/help/replay-a-league/studio.png)

The League’s CI adjudication determines the frozen standings. Replays in your browser remain provisional and don’t replace those standings.

Choose another **Seed** to clear the previous verdict, then click **Replay Seed** to measure it. If Budget shows **Unpriced**, the robot has missing prices or geometry.

To submit a robot, follow [Share a robot as a link](/help/share-a-robot-as-a-link).
