---
title: Find the servos a fall would strip
date: 2026-11-13
image: /changelog/find-the-servos-a-fall-would-strip/cover.png
---

You can now tip a legged robot over in the simulation from 12 directions. A new Falls row in Checks names the servos whose gears the fall would strip.

Most first walking robots strip a knee servo the first time they fall. Until now, the sim checks in Basecase stopped at whether the robot fell.

## How It Works

The agent runs Falls when it verifies the design with falls. The robot holds your modeled pose, with each servo limited to 0.7 of its stall torque, as in Peak torque. The check then leans on the torso from 12 directions 30° apart, each time until the robot tips over.

For each leg joint, Falls takes the 99th percentile torque within 0.3 seconds of hitting the floor and shows it as a multiple of the servo's rated torque.

## What Passes

Up to 3× passes, and anything above 5× blocks Ready to build. The limits follow the rule from the SafeFall paper that gears survive 3 to 5 times their rated torque for a moment.

On our test biped, a 2.4 kg walker on STS3215s, both knees fail.

## Good to Know

Only robots with legs get the row, and its numbers are estimates. Replay in Sim tips the robot the same way in Simulate.

Read [Check what a fall does to the servos](/help/check-what-a-fall-does-to-the-servos) in the help center for the steps.
