---
title: Scanned rooms as Case worlds
date: 2026-11-13
image: /changelog/import-a-scanned-room/cover.png
---

Drop a room scanned with an iPhone on the canvas, and New Case opens with that room as the world, at true size: its walls, doorways, sofa and table, ready to drive through, record and train in.

## Where it is

Scan a room with any app built on Apple's RoomPlan and export its CapturedRoom JSON. Open a scene with a robot, and drop the `.json` file on the canvas. The Cases tab opens New Case with the room picked as the World, named after the file, beside Open Floor, Corridor and Block. The Case name follows it, like “Reach a Spot in Living Room”.

![New Case with Living Room picked as the World](/changelog/import-a-scanned-room/new-case.png)

## What the room becomes

Every wall is a solid box, cut where RoomPlan found a door, an opening or a window. A doorway is open from the floor to the top of the door, and a window keeps the wall under and over it, so a robot drives from one room to the next only through the doors. Each piece of furniture is a box at the size RoomPlan measured, named after its category: Sofa, Table, Chair, Storage. Chairs and storage boxes under 60 cm can be pushed around, at 5 kg and 8 kg; the rest stays put. A room scanned at an angle is turned square to the grid.

The robot starts on the open floor nearest the middle of the room, and Reach a Spot, Push a Box and Follow a Path plan from there, routing around the walls and furniture. An arm gets Touch a Point only when a table-height surface is within its reach.

## True size

A room never resizes to fit the robot the way the made-up worlds do for arms. A 4 m room is 4 m for a rover or a humanoid, so a try, a dataset or a trained policy learns the distances the robot will really meet.

![A rover that drove through the doorway and stopped on the spot, with the passed try in Results](/changelog/import-a-scanned-room/results.png)

## What it doesn't do

It reads the JSON only, not RoomPlan's USDZ. A room holds up to 256 objects, and a bigger scan keeps the largest ones. Furniture is solid to the floor, so a robot can't drive under a table.
