---
title: Keep every robot session as a try
date: 2026-11-14
image: /changelog/keep-every-robot-session-as-a-try/cover.png
---

Basecase now keeps every session on a connected robot as a try. You don't have to start anything.

You find them in **Library** ▸ **Tries**, badged Operate, next to the tries from your Cases.

Until now, a demonstration you drove with a gamepad or your camera was gone when you disconnected. Operate kept only the last 20 seconds in memory, for Replay in Sim. Now Basecase saves the whole session to disk, and Replay in Sim reads it from the try.

## What a Try Keeps

A try keeps each joint's measured position, plus its velocity and effort when the robot reports them. An emulated ROS 2 arm reports both from its joint states. The try also keeps every command sent to the robot, the simulation's angles at the same moments, and the raw values from your input.

Turn your camera on and the try keeps up to 30 minutes of its video, which plays beside the timeline at the playhead. The frames never leave your computer.

A 10-minute session of a 6-joint arm driven by the keyboard takes under 3.5 MB, before any video.

## What Isn't Kept

A session shorter than 2 seconds leaves no try, and neither does one where no joint moves more than about 1°. Basecase still keeps a session that ends in a fault after it sent the robot a command, for Replay in Sim.

Real motors stay locked, so every session is on an emulated robot. The try has no Case, so Basecase doesn't judge it.

Read [Record a robot session as a try](/help/record-a-robot-session-as-a-try) in the help center for the steps.
