---
title: Wrap a robot in a character shell
date: 2026-11-13
image: /changelog/wrap-a-robot-in-a-character-shell/cover.png
---

You can now turn a mesh you imported, such as an owl, a droid body or a mascot, into printed shells around a jointed robot. Wrap Robot makes one shell per link and cuts them at the joints, so the robot can move.

## Where it is

Select both a robot and an imported mesh, then choose Wrap Robot from ⌘K or the right-click menu. It runs in the background with a progress toast, and the canvas stays live while it works. On the SO-101 it takes about half a minute.

Read [Wrap a robot in a character shell](/help/wrap-a-robot-in-a-shell) in the help center for the steps.

![The ⌘K palette with Wrap Robot over the SO-101 arm and an owl mesh](/changelog/wrap-a-robot-in-a-character-shell/palette.png)

## What it does

First, Wrap Robot scales the mesh uniformly and centers it on the robot, until it covers the robot with 6 mm to spare. Then it hollows the mesh to a 2 mm wall.

Next it cuts the mesh at every joint, leaving one shell per link. Each cut passes through the joint's pivot, square to the line between the two links.

Last, it cuts away anything that would collide: the space the robot's own parts fill at rest, plus whatever a servo, a link or a neighboring shell sweeps through across each joint's full range. It splits the clearance around each joint between the joint's two neighboring shells, so both keep material.

![Seven owl shells around the SO-101, one per link](/changelog/wrap-a-robot-in-a-character-shell/shells.png)

Each shell is attached to its link, so it poses, animates and simulates with that link. Like any other printed part, a shell shows up in the BOM and on the plates, and its weight goes into MuJoCo with its link.

Your mesh is hidden and kept. Press ⌘Z once to bring it back and remove the shells.

The agent can do the same with its `wrap_robot` tool, so you can ask it to wrap the robot in the mesh you imported.

## What it doesn't do yet

The shells are open where the joints need room, and nothing holds two halves of a shell together. Seams with lips and screw bosses come next, then generating the mesh from a sentence.

A joint with a big range, such as the SO-101's ±100° shoulder, leaves a wide opening because the shell has to clear the whole range.
