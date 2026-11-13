---
title: Command Center
date: 2026-11-13
image: /changelog/command-center/cover.png
---

Open Command Center runs a Case in one window: the robot on the canvas, its cameras beside it, the emulated servos and your tries, with the things that have gone wrong so far listed as you drive.

## Where it is

Open a Case, then click the expand button in the Brief's header in the Simulate tab, or press ⌘K and choose Open Command Center. Done or Esc takes you back with the scene, the selection and the camera as they were.

![The Simulate tab with the Brief and its Open Command Center button](/changelog/command-center/brief.png)

## What's in it

The canvas stays in the middle and follows a robot that drives around. The left card holds the Case's cameras, the same live tiles as the strip on the canvas, now as wide as the card: the Scene view or your stationary views, then each camera on the robot. The right card is headed by the Case's name and holds three panels:

- The brief, and while a try runs, each failure the Case's contract has seen so far, in red, checked twice a second against the same contract that scores the try.
- The emulated robot, in the desktop app: Connect Emulated Robot, then the rung you're on, Stop while the motors run, the newest message from the daemon and each servo's angle and temperature.
- Try and Results: Try It, the clock and End Try, then every try with Replay, Export Dataset and Publish to Hugging Face.

![The Command Center with the arm, its Scene and Wrist Camera tiles, Connect Emulated Robot and Try It](/changelog/command-center/center.png)

## What it replaces

Before, a teleop session sat in three places: the Case and its tries in Simulate, the connected robot in Operate, and camera views floating on the canvas. The Simulate tab also repeated the connected robot's status in an Emulated robot section. That section is gone; the robot's status lives in Operate and the Command Center.

## Cases that say how they run

A Case file can carry a console: the input (keys or gamepad) and the panels it opens with, in order. A Case without one opens every panel with keys, so every Case you already have works as it is.

## Not yet

Driving with the Mac's camera, and showing that camera as a tile, come next.
