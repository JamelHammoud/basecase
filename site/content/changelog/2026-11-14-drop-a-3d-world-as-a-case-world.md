---
title: Drop a captured 3D world as a Case world
date: 2026-11-14
image: /changelog/drop-a-3d-world-as-a-case-world/cover.png
---

You can now drop a 3D world from World Labs Marble, Polycam, Scaniverse or Luma on the canvas, and New Case opens with it as the world. Basecase brings it in at true size and cuts a collider from its mesh for your robot to drive on.

Your kitchen rover can now run its Reach a Spot past the counter and under the table of the kitchen you captured, and Checks judges it there across 20 runs. Until now, Checks judged it among gray boxes.

## What You Can Drop

Basecase reads GLB, glTF and OBJ meshes. A Gaussian splat (`.spz` or `.ply`) can come along with the mesh, and Spark, World Labs' three.js renderer, draws it on the canvas.

## What the Robot Drives On

The splat has no collider. V-HACD splits the mesh into up to 64 convex pieces, and those are what your robot collides with. Basecase does the split off the main thread, in about 3 seconds for a 200,000-triangle room.

The floor and gentle ramps count as ground, and the gap under a table stays open. Marble exports worlds upside down by default, so Basecase turns them upright.

The agent can also make Cases in the world.

## Limits

Each drop holds one world. Each file can be up to 300 MB, with up to 500,000 triangles and 3,000,000 splat points. Camera views and dataset videos leave out the splat. The world stays on the computer you dropped it on.

Read [Import a captured 3D world as a Case world](/help/import-a-captured-3d-world) in the help center for the steps.
