---
title: Test robot encounters with people
date: 2026-11-20
image: /changelog/test-person-encounters/cover.png
---

You can add people to a Case world and test your robot against their timed routes. Save a try to play the crossing back on the timeline.

The **World** section in **Simulate** keeps body dimensions, waypoint coordinates, speed, start delay and waypoint pauses with the Case.

Your rover might reach a spot in the kitchen in an empty room, then hit someone crossing the aisle. Set up a crossing to repeat that encounter with the robot's current geometry.

Each person has six rigid boxes for appearance and collision. Routes advance with each physics step, so rendering batches don't affect route timing. You keep the existing Case goal for task success and get a named failure if the robot contacts a person.

You can add up to 16 people to a world. Each route has 2–32 waypoints, at most 20 meters of travel and a schedule of up to 600 seconds. You can't run a simulation with routes that pass through static obstacle bounds.

People don't choose a route or react to the robot. You can use these simulations to test encounters, but you can't use the results to make claims about human biomechanics or physical safety.

Steps are in [Test a person crossing](/help/test-a-person-crossing).
