---
title: Scanned rooms as Case worlds
date: 2026-11-13
image: /changelog/import-a-scanned-room/cover.png
---

You can now drop a room scanned with an iPhone on the canvas, and New Case opens with that room as the world. It comes in at true size with its walls, doorways, sofa and table, and you can drive through it, record in it and train in it.

## Where it is

Scan a room with Basecase Scan, our iPhone app. Tap the plan where the robot stands, then AirDrop the file to your Mac. Open a scene with a robot and drop the `.json` file on the canvas.

The Cases tab opens New Case with the room picked as the World. The room is named after the file and sits beside Open Floor, Corridor and Block. The Case name follows it, like “Reach a Spot in Living Room”.

The steps are in [Import a scanned room as a Case world](/help/import-a-scanned-room).

![New Case with Living Room picked as the World](/changelog/import-a-scanned-room/new-case.png)

## What the room becomes

Every wall is a solid box, cut where RoomPlan found a door, an opening or a window. A doorway is open from the floor to the top of the door. A window keeps the wall under it and over it, so a robot only gets from one room to the next through the doors.

Each piece of furniture is a box at the size RoomPlan measured, named after its category: Sofa, Table, Chair, Storage. A robot can push chairs and storage boxes under 60 cm around. They weigh 5 kg and 8 kg. The rest stays put. If you scanned the room at an angle, Basecase turns it square to the grid.

![The scan app's plan, with the robot placed beside the table](/changelog/import-a-scanned-room/plan.png)

The robot starts where you tapped, facing the way you dragged, turned square to the walls. If it doesn't fit there, or another RoomPlan app wrote the file, it starts on the open floor nearest the middle.

Reach a Spot, Push a Box and Follow a Path plan from there, and route around the walls and furniture. An arm only gets Touch a Point when a table-height surface is within its reach.

## Drive to the door

The spot in Reach a Spot or Follow a Path can be a door or a piece of furniture, picked by name: Door, Sofa, Under Table. That way a Case reads “drive under the table” instead of “drive 2.2 m”, and the agent's Cases use the same names. A table keeps only its top, so a rover passes under it.

Seeded runs move and turn the furniture, since furniture moves every day. Each fixed piece moves up to 50 mm and 5°, or up to 100 mm and 10° where RoomPlan was less sure. Walls and doors stay put.

![New Case in a scanned room, with Under Table picked as the Spot](/changelog/import-a-scanned-room/under-table.png)

## True size

The made-up worlds resize to fit an arm. A scanned room never resizes to fit the robot: a 4 m room is 4 m for a rover and for a humanoid. So a try, a dataset or a trained policy learns the distances the robot will meet in that room.

![A rover that drove through the doorway and stopped on the spot, with the passed try in Results](/changelog/import-a-scanned-room/results.png)

## What it doesn't do

Basecase reads the JSON file. It doesn't read RoomPlan's USDZ. Basecase Scan isn't on the App Store. It runs from Xcode on a LiDAR iPhone or iPad.

A room holds up to 256 objects, and a bigger scan keeps the largest ones. Only a table is hollow underneath. A bed or a sofa is solid down to the floor.
