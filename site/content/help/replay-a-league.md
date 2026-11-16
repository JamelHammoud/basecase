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

You can compare shared robots on one Case, replay a measured seed, and open the selected robot in your browser’s studio.

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

The ranking order is passes, the pinned score in its declared direction, lower Budget, and a stable entry identity.
Budget uses catalog prices and measured geometry. If prices or geometry are missing, you’ll see **Unpriced** instead of a zero cost.

Each League pins its Case, contract, engine, deadline and ranking rules. You can’t submit executable Case panels, Case logic or imported worlds. Retained skills must use a network policy controller.

To submit your robot before the deadline, follow [Share a robot as a link](/help/share-a-robot-as-a-link).
You need a trusted CI receipt for your submission before the deadline to enter the frozen standings.
