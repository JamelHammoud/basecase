---
title: Replay failing Case seeds
date: 2026-11-14
image: /changelog/replay-failing-seeds/cover.png
---

You can now click a failed Case path on the canvas to inspect its first failure on the joint timeline.

Open a Case's row in **Build** ▸ **Checks** to draw all 20 seeded paths. A rover can pass some randomized runs and miss its target in others. The red paths show which runs failed, so you can inspect their joint positions and effort at the failure.

Green paths passed. Each path follows the robot's base, or an arm's end effector, at ten samples per second. Clicking a red path reruns that seed and opens the first failure marker. A missed goal opens at the final judged frame.

The replay is temporary and adds no saved try. Closing it restores the previous simulation world.

Steps are in [Replay a failing seed](/help/replay-a-failing-seed).
