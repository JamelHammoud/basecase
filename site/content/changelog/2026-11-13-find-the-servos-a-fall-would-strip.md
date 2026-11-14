---
title: Find the servos a fall would strip
date: 2026-11-13
image: /changelog/find-the-servos-a-fall-would-strip/cover.png
---

You can now tip a legged robot over in the simulation from 12 directions. A new Falls row in Checks names the servos whose gears the fall would strip.

Most first walking robots strip a knee servo the first time they fall. Every other sim check in Basecase stops at whether the robot fell. Falls measures what the fall does.

The agent runs it when it verifies the design with falls. It holds your modeled pose with each servo limited to 0.7 of its stall torque, as Peak torque does. Then it leans on the torso until the robot tips, 30° apart all the way around. Each leg joint reads as a multiple of its servo's rated torque, at the 99th percentile within 0.3 seconds of hitting the floor.

Up to 3× passes, and above 5× blocks Ready to build. Those limits follow the SafeFall paper's rule that gears survive 3 to 5 times rated torque for a moment. On our test biped, a 2.4 kg walker on STS3215s, both knees fail.

The numbers are estimates. Only robots with legs get the row. Replay in Sim tips the robot the same way in Simulate.

Steps are in [Check what a fall does to the servos](/help/check-what-a-fall-does-to-the-servos).
