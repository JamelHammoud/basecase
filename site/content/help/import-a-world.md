---
title: Import a captured world
date: 2026-11-14
updated: 2026-11-14
collection: simulate-and-train
type: task
covers:
  - src/cases/worldImport.ts
  - src/cases/worldImport/limits.ts
  - src/cases/worldImport/geometry.ts
  - src/cases/worldImportClient.ts
  - src/cases/importedWorld.ts
  - src/components/cases/NewCaseCard.tsx
  - src/workspace/worldImport.ts
  - src/workspace/useCanvasDrop.ts
  - src/three/viewport/importedWorld.ts
keywords:
  - Marble
  - World Labs
  - Polycam
  - Scaniverse
  - Luma
  - Gaussian splat
---

Bring a captured or generated place into a Case so your robot can drive through it at true size.

The capture must have a GLB, glTF or OBJ collider mesh. A splat alone can't supply the floor or walls.

1. Open a scene with a robot.
2. Drop the world's GLB, glTF or OBJ collider onto the canvas, together with its SPZ or PLY splat if it has one. Include any separate buffers, materials and texture folders in the same drop.
3. In **New Case**, choose a goal for the robot. The world is already picked under **World**, named after the collider file.

![New Case with Kitchen picked as the World and Reach a Spot chosen](/help/import-a-world/new-case.png)

4. Set the goal's distance and time.
5. Click **Make Case**.

![A rover in an imported kitchen world with its Case goal](/help/import-a-world/kitchen.png)

6. Click **Try It**, then drive with [[W]], [[A]], [[S]] and [[D]].
7. Click **Stop Try** to save the result.

A mesh without a splat shows its own colors or textures. Keep every linked file inside the dropped set, because Basecase doesn’t download missing resources.

The dropped files can total up to 64 MB, with up to 200,000 collider triangles and 1,000,000 splat points. Basecase reads the world as meters unless its largest extent is at least 1,000 units, which it reads as millimeters. It levels the largest upward-facing plane to the floor.

The imported appearance is shown on the main canvas. Camera tiles and dataset videos don't include that appearance.

For a RoomPlan JSON capture, follow [Import a scanned room as a Case world](/help/import-a-scanned-room). Continue with [Try a Case](/help/try-a-case) to record another run.

For scans in an imported ROS recording, use **Make World** from the **Map** row's menu in **Layers**. It opens **New Case** with the reconstructed world selected. A planar scan's floor and 1 m obstacle height are estimates, labeled under **World**. Follow [Map a robot run](/help/map-a-robot-run) for the steps and limits.
