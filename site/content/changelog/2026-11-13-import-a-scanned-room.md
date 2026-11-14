---
title: Scanned rooms as Case worlds
date: 2026-11-13
image: /changelog/import-a-scanned-room/cover.png
---

Drop a room scanned with an iPhone on the canvas, and New Case opens with that room as the world. It comes in at true size, with its walls, doorways, sofa and table, ready to drive through, record and train in.

## Where it is

Scan a room with Basecase Scan, our iPhone app, tap the plan where the robot stands, and AirDrop the file to your Mac. Open a scene with a robot, and drop the `.json` file on the canvas. The Cases tab opens New Case with the room picked as the World, named after the file, beside Open Floor, Corridor and Block. The Case name follows it, like “Reach a Spot in Living Room”. Steps are in [Import a scanned room as a Case world](/help/import-a-scanned-room).

![New Case with Living Room picked as the World](/changelog/import-a-scanned-room/new-case.png)

## What the room becomes

Every wall is a solid box, cut where RoomPlan found a door, an opening or a window. A doorway is open from the floor to the top of the door. A window keeps the wall under and over it, so a robot drives from one room to the next only through the doors.

Each piece of furniture is a box at the size RoomPlan measured, named after its category: Sofa, Table, Chair, Storage. Chairs and storage boxes under 60 cm can be pushed around, at 5 kg and 8 kg; the rest stays put. A room scanned at an angle is turned square to the grid.

![The scan app's plan, with the robot placed beside the table](/changelog/import-a-scanned-room/plan.png)

The robot starts where you tapped, facing the way you dragged, turned square to the walls. When it doesn't fit there, or another RoomPlan app wrote the file, it starts on the open floor nearest the middle. Reach a Spot, Push a Box and Follow a Path plan from there, routing around the walls and furniture. An arm gets Touch a Point only when a table-height surface is within its reach.

## Drive to the door

A Reach a Spot or Follow a Path spot can be a door or a piece of furniture, by name: Door, Sofa, Under Table. People say “drive under the table”, not “drive 2.2 m”, and the agent's Cases take the same names. A table keeps only its top, so a rover passes under it.

Furniture moves every day, so seeded runs move and turn it. Each fixed piece moves up to 50 mm and 5°, or 100 mm and 10° where RoomPlan was less sure. Walls and doors stay put.

![New Case in a scanned room, with Under Table picked as the Spot](/changelog/import-a-scanned-room/under-table.png)

## True size

A room never resizes to fit the robot the way the made-up worlds do for arms. A 4 m room is 4 m for a rover or a humanoid. A try, a dataset or a trained policy learns the distances the robot will really meet.

![A rover that drove through the doorway and stopped on the spot, with the passed try in Results](/changelog/import-a-scanned-room/results.png)

## What it doesn't do

It reads the JSON only, not RoomPlan's USDZ. Basecase Scan runs from Xcode on a LiDAR iPhone or iPad; it isn't on the App Store. A room holds up to 256 objects, and a bigger scan keeps the largest ones. Only a table is hollow underneath; a bed or a sofa is solid to the floor.
