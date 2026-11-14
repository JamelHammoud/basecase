---
title: Import a scanned room as a Case world
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/cases/roomPlan.ts
  - src/cases/roomWalls.ts
  - src/cases/roomWorld.ts
  - src/cases/roomFurniture.ts
  - src/cases/roomTargets.ts
  - src/cases/roomJitter.ts
  - src/components/cases/RoomTargetPicker.tsx
  - src/workspace/useCanvasDrop.ts
  - src/components/cases/NewCaseCard.tsx
  - ios/BasecaseScan/StandView.swift
  - ios/BasecaseScan/RoomFile.swift
---

Drive, record and train your robot in the room it will live in, at true size, instead of on an empty floor.

Basecase Scan, the iPhone app, scans the room with Apple's RoomPlan and marks where the robot stands. It needs an iPhone or iPad with LiDAR, a Pro model. It isn't on the App Store: open `ios/BasecaseScan.xcodeproj` from the Basecase repository in Xcode, plug in the phone and press Run.

1. In Basecase Scan, tap **Scan**.
2. Walk the room slowly, following RoomPlan's prompts, and tap **Done**.
3. Tap the plan where the robot stands. Drag from that spot to point the robot the way it should face.

![The plan of a scanned room, with the robot placed beside the table and its arrow pointing along the wall](/help/import-a-scanned-room/plan.png)

4. Tap **Share**, and AirDrop the file to your Mac or save it to Files. It's named after the room the robot stands in, like `Living Room.json`.
5. On the Mac, open a scene with a robot in it.
6. Drop the `.json` file on the canvas. New Case opens in the Cases tab with the room picked as the World, named after the file.

![New Case with the scanned room picked as the World](/help/import-a-scanned-room/new-case.png)

7. Pick a goal (Reach a Spot, Push a Box or Follow a Path) and set its numbers. The robot starts where you tapped, facing the way the arrow pointed, and the goal is measured from there.
8. To send the robot to a door or a piece of furniture, click its name under **Spot**, like **Door** or **Under Table**.

![New Case with Under Table picked as the Spot](/help/import-a-scanned-room/spot.png)

9. Click **Make Case**. The room appears around the robot.

![The room on the canvas: two rooms joined by a doorway, with a sofa, a table and a chair](/help/import-a-scanned-room/room.png)

10. Click **Try It** and drive with [[W]], [[A]], [[S]] and [[D]].

![A rover driving through the doorway toward the spot](/help/import-a-scanned-room/drive.png)

When the try ends, it's listed under Results, and a passed try can go into a dataset like any other.

![A passed try in Results](/help/import-a-scanned-room/results.png)

The arrow turns to the nearest quarter turn along the walls, so the robot always faces square to the room. A tap inside furniture or outside the walls places nothing. If the robot doesn't fit where you tapped, by a wall or between two boxes, it starts on the open floor nearest the middle of the room. So does a room from any other RoomPlan app's CapturedRoom JSON.

Walls become solid boxes with gaps at their doors and openings, so a robot can drive from room to room. Each piece of furniture becomes a box the size RoomPlan measured, named after what it is. A table keeps only its top, so a robot shorter than the table can drive under it. Chairs and small storage boxes can be pushed; everything else stays put. A room keeps its true size whatever robot enters it. An arm gets Touch a Point in a room only when a table-height surface is within its reach.

A spot named after furniture sits on the open floor in front of it, and a door's sits in the doorway. **Under Table** is offered only to a robot shorter than the table's underside. With a named spot, **Time** grows with the trip, 100 mm a second on wheels.

A Case's 20 runs in Checks and Multiply move each piece of furniture that stays put by up to 50 mm and turn it up to 5°, so a policy doesn't learn one exact layout. A piece RoomPlan was less sure of moves up to 100 mm and 10°. Walls and doors never move, and no piece moves into a wall or onto the robot's start.

If the file isn't a room Basecase can read, a toast says it couldn't import it, and nothing changes.
