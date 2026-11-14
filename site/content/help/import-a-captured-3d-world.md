---
title: Import a captured 3D world as a Case world
date: 2026-11-14
collection: simulate-and-train
type: task
covers:
  - src/cases/worldImport.ts
  - src/cases/worldFrame.ts
  - src/cases/worldCollider.ts
  - src/cases/worldGround.ts
  - src/cases/meshWorld.ts
  - src/three/worldLook.ts
  - src/workspace/worldDrop.ts
  - src/workspace/useCanvasDrop.ts
  - src/components/cases/NewCaseCard.tsx
---

You can drive your robot through a real place captured with World Labs Marble, Polycam, Scaniverse or Luma. The world comes in at true size, and the robot bumps into its walls and furniture.

Basecase reads a collider mesh (GLB, glTF or OBJ). You can also add a Gaussian splat (`.spz` or `.ply`) to give the world its look. A Marble export includes both, while a phone capture often includes only the mesh.

1. Export the world from the app that made it. In Marble, export the splat and the collider mesh. In a capture app, export a GLB.
2. In Basecase, open a scene with a robot in it.
3. Select the splat and the mesh together, then drop them on the canvas. Basecase opens New Case in the Cases tab with the world picked as the **World**. The world is named after the mesh file.

![New Case with Kitchen picked as the World](/help/import-a-captured-3d-world/new-case.png)

4. Pick a goal (**Reach a Spot**, **Push a Box**, **Follow a Path** or **Walk Without Falling**) and set its numbers.
5. Click **Make Case**. The world appears around the robot, which starts on open floor near the middle.

![The kitchen's splat on the canvas, with the rover on the floor in front of the table](/help/import-a-captured-3d-world/world.png)

6. Click **Try It**, then drive with [[W]], [[A]], [[S]] and [[D]].

When the try ends, it appears under Results. Like any other Case, Checks judges it across 20 runs.

You can also drop a GLB on its own. If it's at least 2 m across, it opens as a world. If it's smaller, it becomes a part.

## What the robot touches

The robot never touches the splat. It collides with up to 64 convex pieces cut from the mesh, which stay hidden. The largest flat surface facing up is the floor, and it becomes the simulation's ground. A gap under a table stays open, so a robot shorter than the table can drive under it. Other pieces, like a ramp or a slope, also count as ground when they rise no more than 15° and start within 60 mm of the floor or of other ground. A reference drive goes over ground and around everything else, like walls and counters.

Basecase reads a file over 200 units across as millimeters, and anything smaller as meters. If a world was exported upside down, as Marble does by default, Basecase turns it upright.

## Limits

Each drop holds one world: one mesh and at most one splat. A file can be up to 300 MB, and a whole drop up to 600 MB. A mesh can have up to 500,000 triangles, and a splat up to 3,000,000 points. Basecase refuses meshes compressed with Draco or meshopt.

Basecase stores the world in this app and identifies it by its contents. If you open a Case made in it on another computer, the Case has no look and runs with each piece as a plain box until you drop the same files on that computer.

## If the import fails

If you drop a splat without its mesh, you'll see “Drop ⟨file⟩ with its collider mesh.” If you drop any other file Basecase can't read, a toast says it couldn't import it, and nothing changes.

To use a room you scanned on an iPhone, see [Import a scanned room as a Case world](/help/import-a-scanned-room). For a list of the worlds and goals, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
