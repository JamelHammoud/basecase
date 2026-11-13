---
title: Import a scanned room as a Case world
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/cases/roomPlan.ts
  - src/cases/roomWalls.ts
  - src/cases/roomWorld.ts
  - src/workspace/useCanvasDrop.ts
  - src/components/cases/NewCaseCard.tsx
---

Drive, record and train your robot in the room it will live in, at true size, instead of on an empty floor. Basecase reads the room file an iPhone app built on Apple's RoomPlan saves: the CapturedRoom JSON with the room's walls, doors, windows and furniture.

1. Scan the room with a RoomPlan app on a LiDAR iPhone or iPad, and export the room as JSON.
2. Open a scene with a robot in it.
3. Drop the `.json` file on the canvas. New Case opens in the Cases tab with the room picked as the World, named after the file.

![New Case with the scanned room picked as the World](/help/import-a-scanned-room/new-case.png)

4. Pick a goal (Reach a Spot, Push a Box or Follow a Path) and set its numbers. The robot starts on the open floor nearest the middle of the room, facing the same way it does in the scene, and the goal is measured from there.
5. Click **Create**. The room appears around the robot.

![The room on the canvas: two rooms joined by a doorway, with a sofa, a table and a chair](/help/import-a-scanned-room/room.png)

6. Click **Try It** and drive with W, A, S and D.

![A rover driving through the doorway toward the spot](/help/import-a-scanned-room/drive.png)

When the try ends, it's listed under Results, and a passed try can go into a dataset like any other.

![A passed try in Results](/help/import-a-scanned-room/results.png)

Walls become solid boxes with gaps at their doors and openings, so a robot can drive from room to room. Each piece of furniture becomes a box the size RoomPlan measured, named after what it is. Chairs and small storage boxes can be pushed; everything else stays put. A room keeps its true size whatever robot enters it. An arm gets Touch a Point in a room only when a table-height surface is within its reach.

If the file isn't a room Basecase can read, a toast says it couldn't import it, and nothing changes.
