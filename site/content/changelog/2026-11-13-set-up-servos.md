---
title: Set up servos
date: 2026-11-13
image: /changelog/set-up-servos/wrist.png
---

You can now number a new robot's servos with Set Up Servos. It gives each new servo the ID its joint has in the scene, one servo at a time, and selects the next joint on the canvas.

## Where it is

Set Up Servos is under Connect Emulated Robot in Operate, in the Play view, and in ⌘K. Operate offers it before the robot connects, then once more in Look or Set up while any servo doesn't answer at its ID.

## How it works

Your first robot arrives as a bag of servos that all answer at ID 1. Basecase numbers the movable joints 1, 2, 3 and so on, and the robot package's joint map uses the same numbers.

Set Up Servos connects the robot in Set up with the motors off and walks the joints from the highest ID down. At each joint it selects the joint's moving parts on the canvas, and Operate shows one row with the joint's name and its ID. When one new servo answers, the app asks the robot daemon to write the ID.

![The Wrist row with ID 3 while the wrist's moving part is selected](/changelog/set-up-servos/wrist.png)

On a Feetech servo, the daemon unlocks the servo's memory, writes the ID, locks the memory and reads the ID back. Then the next joint lights up.

![The Elbow row with ID 2, one joint further down the arm](/changelog/set-up-servos/elbow.png)

ID 1 goes last because new servos arrive with it. Numbering from the top means you can leave the finished servos plugged in, and none of them clashes with the next new one. Finish the last servo and the ladder goes from Set up to Test in one step.

![Every servo answering in Set up after the walk](/changelog/set-up-servos/numbered.png)

## When it stops

Press Esc to stop the walk. The servos keep the IDs you've written, and if you run Set Up Servos again it picks up at the first joint that doesn't answer.

The daemon refuses when no new servo answers, when two answer at once, or when another servo already has the ID. It also refuses while the new servo's motor is on, and says why under the servo count.

## What it doesn't do

This build keeps real motors locked, so Set Up Servos runs on emulated servos and Basecase plugs in each new one for you. Real servos stay off until the first hardware session.

Read [Number a robot's servos](/help/number-a-robots-servos) in the help center for the steps.
