---
title: Drop a captured 3D world as a Case world
date: 2026-11-14
image: /changelog/drop-a-3d-world-as-a-case-world/cover.png
---

You can now drop a 3D world from World Labs Marble, Polycam, Scaniverse or Luma on the canvas, and New Case opens with it as the world. It comes in at true size, and your robot drives on a collider cut from its mesh.

A rover built for a kitchen used to be judged among gray boxes. Now its Reach a Spot runs past the counter and under the table of the kitchen you captured, and Checks judges it there across 20 runs.

Basecase reads a GLB, glTF or OBJ mesh, with or without a Gaussian splat (`.spz` or `.ply`). The splat draws on the canvas with Spark, World Labs' three.js renderer. The robot never touches it. It collides with up to 64 convex pieces that V-HACD splits from the mesh off the main thread, about 3 seconds for a 200,000-triangle room.

The floor becomes the ground, the gap under a table stays open, and a gentle ramp counts as ground. A Marble export, which comes out upside down by default, is turned upright. The agent can make Cases in the world too.

A drop holds one world, up to 300 MB a file, 500,000 triangles and 3,000,000 splat points. Camera views and dataset videos don't show the splat. The world stays on the computer you dropped it on.

Steps are in [Import a captured 3D world as a Case world](/help/import-a-captured-3d-world).
