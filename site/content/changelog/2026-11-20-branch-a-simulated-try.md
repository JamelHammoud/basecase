---
title: Drive a different ending from a saved try
date: 2026-11-20
image: /changelog/branch-a-simulated-try/cover.png
---

You can take control from a saved scripted simulation checkpoint and keep an alternative try beside the original. Open a single-robot recording through Library and choose Branch Try in the timeline.

Your robot may open a drawer as intended, then lose its grip. Keep that beginning and drive another ending from a retained checkpoint.

For new supported scripted recordings, we retain one checkpoint per second, up to 120 checkpoints and 8 MiB of checkpoint data. Each checkpoint contains the physics, actuator history, active faults and world state. Scheduled faults and world changes keep their original times.

In the alternative try, you keep the original prefix and record your new commands after the checkpoint. You get a result for the whole attempt, including earlier failures. You still have the original time limit, and you leave the saved source unchanged.

You can branch single-robot scripted simulation tries. You can play older recordings, but you won’t find checkpoints for routine, policy or code controllers. Use Export Try to save the branch and its available parents in one file.

Steps are in [Branch a simulated try](/help/branch-a-simulated-try).
