---
title: Wrap a robot in a character shell
date: 2026-11-13
image: /changelog/wrap-a-robot-in-a-character-shell/cover.png
---

Wrap Robot turns a mesh you imported, an owl, a droid body, a mascot, into printed shells around a jointed robot: one per link, cut at the joints so the robot still moves.

## Where it is

Select a robot and an imported mesh together, then choose Wrap Robot from ⌘K or the right-click menu. It runs in the background with a progress toast, and the canvas stays live while it works. On the SO-101 it takes about half a minute.

![The ⌘K palette with Wrap Robot over the SO-101 arm and an owl mesh](/changelog/wrap-a-robot-in-a-character-shell/palette.png)

## What it does

The mesh is scaled evenly and centred on the robot until it covers it with 6 mm to spare, then hollowed to a 2 mm wall. It's cut at every joint, through the joint's pivot and square to the line between the two links, into one shell per link. Then everything that would collide is cut away: the robot's own parts at rest, and whatever a servo, a link or a neighbouring shell sweeps through across each joint's full range. Neighbouring shells split the clearance around a joint between them, so both keep material.

![Seven owl shells around the SO-101, one per link](/changelog/wrap-a-robot-in-a-character-shell/shells.png)

Each shell is attached to its link, so it poses, animates and simulates with it, and it's a printed part like any other: it's in the BOM, on the plates, and its weight goes into MuJoCo with its link. The mesh is hidden rather than deleted, and one ⌘Z brings it back and removes the shells.

The agent has the same action as its `wrap_robot` tool, so you can ask it to wrap the robot in the mesh you just imported.

## What it doesn't do yet

The shells are open where the joints need room, and nothing holds two halves of a shell together. Seams with lips and screw bosses come next, then generating the mesh from a sentence. Joints with big ranges, like the SO-101's ±100° shoulder, leave wide openings, since the shell has to clear the whole range.
