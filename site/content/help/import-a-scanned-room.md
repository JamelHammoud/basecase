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

Swap the empty floor for the room your robot will live in, at true size, then drive, record and train it there.

Basecase Scan, the iPhone app, scans the room with Apple's RoomPlan and marks where the robot stands. It needs an iPhone or iPad with LiDAR, which means a Pro model. Basecase Scan isn't on the App Store. To install it, open `ios/BasecaseScan.xcodeproj` from the Basecase repository in Xcode, plug in the phone and press Run.

1. In Basecase Scan, tap **Scan**.
2. Walk slowly around the room and follow RoomPlan's prompts, then tap **Done**.
3. Tap the plan where the robot stands, then drag from that spot toward the way the robot should face.

![The plan of a scanned room, with the robot placed beside the table and its arrow pointing along the wall](/help/import-a-scanned-room/plan.png)

4. Tap **Share**, then AirDrop the file to your Mac or save it to Files. The file is named after the room the robot stands in, for example `Living Room.json`.
5. On your Mac, open a scene that has a robot in it.
6. Drop the `.json` file on the canvas. Basecase opens New Case in the Cases tab, picks the room as the World and names it after the file.

![New Case with the scanned room picked as the World](/help/import-a-scanned-room/new-case.png)

7. Pick a goal (Reach a Spot, Push a Box or Follow a Path) and set its numbers. The robot starts where you tapped, facing the way the arrow pointed, and the goal is measured from there.
8. To send the robot to a door or a piece of furniture, click its name under **Spot**, for example **Door** or **Under Table**.

![New Case with Under Table picked as the Spot](/help/import-a-scanned-room/spot.png)

9. Click **Make Case**. Basecase builds the room around the robot.

![The room on the canvas: two rooms joined by a doorway, with a sofa, a table and a chair](/help/import-a-scanned-room/room.png)

10. Click **Try It**, then drive with [[W]], [[A]], [[S]] and [[D]].

![A rover driving through the doorway toward the spot](/help/import-a-scanned-room/drive.png)

The try appears under Results when it ends. You can add a passed try to a dataset like any other.

![A passed try in Results](/help/import-a-scanned-room/results.png)

## Where the robot starts

The arrow snaps to the nearest quarter turn along the walls, so the robot faces square to the room. If you tap inside furniture or outside the walls, the robot isn't placed.

If the robot doesn't fit where you tapped, for example by a wall or between two boxes, it starts on the open floor nearest the middle of the room. It also starts there when the file is a CapturedRoom JSON from any other RoomPlan app.

## How the room is built

- Each wall becomes a solid box with gaps at its doors and openings, so a robot can drive from one room to the next.
- Each piece of furniture becomes a box the size RoomPlan measured, named after what it is.
- Tables keep only their tops, so a robot shorter than the table can drive under it.
- Your robot can push chairs and small storage boxes. Everything else stays put.
- The room keeps its true size for any robot you put in it.
- An arm gets Touch a Point in a room only when a table-height surface sits within its reach.

## Spots

A spot named after furniture sits on the open floor in front of it. A door's spot sits in the doorway. **Under Table** is offered only to a robot shorter than the table's underside.

When you pick a named spot, Basecase lengthens **Time** to match the trip, at 100 mm a second on wheels.

## Runs in Checks and Multiply

Across a Case's 20 runs in Checks and Multiply, each piece of furniture that stays put moves by up to 50 mm and turns by up to 5°, so a policy doesn't learn one exact layout. A piece RoomPlan was less sure of moves by up to 100 mm and turns by up to 10°.

Walls and doors stay fixed. Furniture never moves into a wall or onto the robot's start.

## If the import fails

If Basecase can't read the file as a room, it shows a toast saying it couldn't import it and changes nothing.
