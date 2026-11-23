---
title: Count objects through zones and lines
date: 2026-11-22
image: /changelog/count-objects-through-zones-and-lines/cover.png
---

A Case can now track detected objects from frame to frame and count them through lines and zones you draw on any camera. A console, a Routine or a Case contract reads the counts like any other vision signal.

A conveyor is the plain case. Draw a line across it on the camera panel, run the try, and `vision.target_camera.line.line1.in` counts each block that passes. A zone reads how many blocks sit in a bin and for how long.

Each object keeps one id while it moves. Two people who cross paths keep separate ids, and an object hidden for a moment keeps its own. A flickering detection doesn’t count twice. Tracking runs in the vision worker, so the main thread barely notices it. At 64 detections a frame it costs about 0.1 ms.

The same counts work on simulated cameras, recorded tries and the operator camera. Paused playback holds them. Counts return to zero when nothing is left.

Tracking follows any model that detects objects. An object gone for more than 1.5 seconds returns with a new id. Zones and lines belong to a Case and save with it.

Steps are in [Count objects through zones and lines](/help/count-objects-through-zones-and-lines).
