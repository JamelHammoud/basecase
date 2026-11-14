---
title: Move a Case's world from its code, watch a camera and keep scores
date: 2026-11-13
image: /changelog/shape-a-case-world-from-its-code/cover.png
---

A Case's code panels can now light a target, put the next box on a conveyor or hide a wall while the Case runs. They can also watch a camera and keep a high score in the Case.

It works in any running Case with code panels, the ones the agent builds included. The Case marks which world objects its code may change.

Before, a panel could only read signals and drive. A whack-a-target game had no target to pop up, and its best score was gone after a reload.

Each change to the world is kept on the try with its time. **Replay** and the Case's checks see the same world, so a check can tell the arm touched the lit target. A camera stream is up to 640 × 480 at 15 frames a second, and its pixels never leave your computer. A Case keeps up to 64 KB of its code's data, which saves with the scene and stays after **Reset**.

A panel changes only the objects the Case marks movable, at most 60 times a second, and only while the simulation runs. It can't watch the camera you drive with in this version.

Steps are in [Run a Case](/help/run-a-case).
