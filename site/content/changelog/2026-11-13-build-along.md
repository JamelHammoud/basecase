---
title: Build Along
date: 2026-11-13
image: /changelog/build-along/cover.png
---

Build Along plays your robot's build guide on the canvas one step at a time. Each step counts its screws and labels every servo with its joint and bus ID.

## Where it is

Open ⌘K and choose Build Along, or click Build Along in the build guide's toolbar. A bar at the top of the canvas shows the step, “2 of 5”, with arrows either side and a close button. ← and → move between steps, and Esc takes you back to the scene with its parts, visibility and camera as they were.

## What each step shows

The canvas shows only what's built so far and what this step adds. The new parts start a little way out and fly into place along blue arrows, the same arrows the PDF draws. Under the bar, the step's counts read the way the PDF prints them, like 4 × M3 × 6 Socket Head Screw. You can orbit and zoom while it plays.

![Four screws flying into the base along blue arrows, with 1 × Base and 4 × M3 × 6 Socket Head Screw under the bar](/changelog/build-along/moving.png)

## Servo IDs

A step that adds a servo labels it with the joint it drives and its bus ID, like Shoulder lift, ID 2. The numbers come from the same place as the robot package's joint map and Operate's Connect. So a servo set to that ID and fitted where the label says is the one the sim and Operate expect. A hand-made kit guide keeps the ID script and the assembly video apart; here they're one step.

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/changelog/build-along/cover.png)

## The guide it follows

Build Along reads the same plan the PDF is drawn from, in the order the assembly check proves. If the design changed since the guide was last made, it makes the guide again first. It never edits the scene: hiding parts and moving them in is only how the canvas shows the step.

Steps are in [Build a robot step by step on the canvas](/help/build-along).
