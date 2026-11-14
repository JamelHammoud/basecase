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

Drive your robot through a real place from World Labs Marble, Polycam, Scaniverse or Luma, at true size, with walls and furniture it bumps into.

Basecase reads a collider mesh (GLB, glTF or OBJ), with or without a Gaussian splat (`.spz` or `.ply`) that gives it its look. A Marble export has both. A phone capture often has only the mesh.

1. Export the world from the app that made it. From Marble, export the splat and the collider mesh. From a capture app, export a GLB.
2. In Basecase, open a scene that has a robot in it.
3. Select the splat and the mesh together in Finder, and drop them on the canvas. Basecase opens New Case in the Cases tab, with the world picked as the **World** and named after the mesh file.

![New Case with Kitchen picked as the World](/help/import-a-captured-3d-world/new-case.png)

4. Pick a goal (**Reach a Spot**, **Push a Box**, **Follow a Path** or **Walk Without Falling**) and set its numbers.
5. Click **Make Case**. The world appears around the robot, which starts on open floor near the middle.

![The kitchen's splat on the canvas, with the rover on the floor in front of the table](/help/import-a-captured-3d-world/world.png)

6. Click **Try It**, then drive with [[W]], [[A]], [[S]] and [[D]].

The try appears under Results when it ends, and Checks judges the Case across 20 runs like any other.

A GLB dropped on its own opens as a world too, when it's at least 2 m across. A smaller one becomes a part, as before.

## What the robot touches

The robot never touches the splat. It collides with up to 64 convex pieces cut from the mesh, which stay hidden. The floor is the largest flat surface facing up, and it becomes the simulation's ground. A gap under a table stays open, so a robot shorter than the table drives under it. A piece counts as ground when it rises no more than 15° and starts within 60 mm of the floor or of other ground, like a ramp or a slope. A reference drive goes over ground and around everything else, like walls and counters.

A file over 200 units across is read as millimeters, anything smaller as meters. A world exported upside down, as Marble does by default, is turned upright.

## Limits

A drop holds one world: one mesh and at most one splat. A file can be up to 300 MB and a drop up to 600 MB. A mesh can have up to 500,000 triangles and a splat up to 3,000,000 points. Draco and meshopt compressed meshes are refused.

The world is kept in this app by its contents. Opened on another computer, a Case made in it has no look and runs with each piece as a plain box, until the same files are dropped there.

## If the import fails

A splat dropped without its mesh shows “Drop ⟨file⟩ with its collider mesh.” Any other file Basecase can’t read shows a toast saying it couldn’t import it, and nothing changes.

For a room scanned on an iPhone, see [Import a scanned room as a Case world](/help/import-a-scanned-room). The worlds and goals are listed in [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
