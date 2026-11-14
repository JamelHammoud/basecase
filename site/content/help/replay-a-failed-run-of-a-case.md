---
title: Replay a failed run of a Case
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - failed run
  - seed
  - trail
  - path
  - why it failed
  - 17 of 20
related:
  - scrub-a-try-on-the-timeline
  - get-a-robot-ready-to-build
covers:
  - src/three/viewport/caseTrails.ts
  - src/cases/runPath.ts
  - src/cases/caseRuns.ts
  - src/cases/caseCheckJob.ts
  - src/workspace/caseChecks.ts
  - src/workspace/useTryTimeline.ts
  - src/components/build/CaseCheckItem.tsx
---

See where each of a Case's 20 runs in Checks went, and open a failed one on the timeline where it failed.

1. In the **Build** tab, find the Case's row under **Checks**. The number on the right is how many of its 20 runs passed.

   ![Checks with Reach a Spot at 16 of 20 and Missed under it](/help/replay-a-failed-run-of-a-case/checks.png)

2. Click the row. The Case opens in the **Simulate** tab, and the canvas draws each run as a thin line, green for a pass and red for a failure.

   ![Twenty lines from a rover to its spot, the failed ones short and red beside the rover](/help/replay-a-failed-run-of-a-case/trails.png)

3. Click a red line. Basecase runs that one again and opens it on the timeline under the canvas, at the frame where it first failed.

   ![The timeline under the canvas with the failed run's three wheel lanes](/help/replay-a-failed-run-of-a-case/timeline.png)

4. Step through it as in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline), then press [[Esc]] to close it.

A line follows the robot's base, or the end effector of an arm fixed in place, 10 times a second. Each run changes friction, weight, servo strength and servo delay a little. The replay uses the same changes, so it fails the same way. A run that missed without a named failure, such as running out of time, opens at its start.

The lines show while that Case is open. Captures and the agent's views of the scene leave them out. Furniture and other objects that stay put show where you placed them, not where that run moved them.

The agent's `run_case` reports the same failed runs, each with its number and the frame it first failed at.
