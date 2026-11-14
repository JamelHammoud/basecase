---
title: Build Along
date: 2026-11-13
image: /changelog/build-along/cover.png
---

You can now play your robot's build guide on the canvas, one step at a time. Each step counts its screws and labels every servo with its joint and bus ID.

## Where it is

Open ⌘K and choose Build Along, or click Build Along in the build guide's toolbar. A bar shows up at the top of the canvas with the step, like “2 of 5”, an arrow on each side and a close button.

Press ← and → to move between steps. Press Esc to go back to your scene, with its parts, visibility and camera as they were.

## What each step shows

The canvas shows only what's built so far and what this step adds. The new parts start a little way out and fly into place along blue arrows, the same arrows the PDF draws.

Under the bar, the step's counts read the way the PDF prints them, like 4 × M3 × 6 Socket Head Screw. You can orbit and zoom while it plays.

![Four screws flying into the base along blue arrows, with 1 × Base and 4 × M3 × 6 Socket Head Screw under the bar](/changelog/build-along/moving.png)

## Servo IDs

When a step adds a servo, the servo gets a label with the joint it drives and its bus ID, like Shoulder lift, ID 2.

The numbers come from the same place as the robot package's joint map and Operate's Connect. If you set a servo to that ID and fit it where the label says, it's the one the sim and Operate expect.

A hand-made kit guide keeps the ID script and the assembly video apart. In Build Along, setting the ID and fitting the servo happen in the same step.

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/changelog/build-along/cover.png)

## The guide it follows

Build Along reads the same plan the PDF is drawn from, in the order the assembly check proves. If the design changed since the guide was last made, it makes the guide again first.

Build Along never edits the scene. It hides parts and moves them in on the canvas to show each step.

Read [Build a robot step by step on the canvas](/help/build-along) in the help center for the steps.
