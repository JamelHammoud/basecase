---
title: Set up servos
date: 2026-11-13
image: /changelog/set-up-servos/wrist.png
---

Set Up Servos gives each new servo the ID its joint has in the scene, one servo at a time, while the canvas selects the joint that's next.

## Where it is

It sits under Connect Emulated Robot in Operate, in the Play view, and in ⌘K. It's offered before the robot connects, and again in Look or Set up while any servo doesn't answer at its ID.

![The Wrist row with ID 3 while the wrist's moving part is selected](/changelog/set-up-servos/wrist.png)

## How it works

A first robot arrives as a bag of servos that all answer at ID 1. Basecase already numbers the movable joints 1, 2, 3 and so on, and the robot package's joint map uses the same numbers. Set Up Servos connects the robot in Set up with the motors off and walks the joints from the highest ID down. For each one, the canvas selects the joint's moving parts and Operate shows one row: the joint's name and its ID. When exactly one new servo answers, the app asks the robot daemon to write the ID. On a Feetech servo, the daemon unlocks the servo's memory, writes the ID, locks it again and reads it back before the next joint lights up.

![The Elbow row with ID 2, one joint further down the arm](/changelog/set-up-servos/elbow.png)

ID 1 goes last because it's also the number new servos arrive with. Numbering from the top keeps the servos already done plugged in without clashing with the next new one. Once the last one is done, the ladder climbs straight from Set up to Test.

![Every servo answering in Set up after the walk](/changelog/set-up-servos/numbered.png)

## When it stops

Esc stops the walk, and the IDs already written stay on the servos. Running Set Up Servos again picks up at the first joint that doesn't answer. The daemon refuses when no new servo answers, when two answer at once, when another servo already has the ID, or when the new servo's motor is on, and says why under the servo count.

## What it doesn't do

Real motors stay locked in this build, so it runs on emulated servos: each new one is plugged in for you. Turning on real servos waits for the first hardware session.
