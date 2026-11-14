---
title: Keep every robot session as a try
date: 2026-11-14
image: /changelog/keep-every-robot-session-as-a-try/cover.png
---

Every session on a connected robot is now kept as a try. There's nothing to start. Moving the robot by hand in Look counts as a demonstration too.

Find the tries in **Library** ▸ **Tries**, badged Operate, next to the tries from your Cases.

Until now, a demonstration you drove with a gamepad or your camera was gone when you disconnected. Operate kept only the last 20 seconds, in memory, for Replay in Sim. Now the whole session is saved to disk, and Replay in Sim reads it from the try.

## What a Try Keeps

A try keeps each joint's measured position, plus its velocity and effort when the robot reports them. An emulated ROS 2 arm reports both from its joint states.

It also keeps every command sent, the simulation's angles at the same moments, and the raw values from your input. With your camera on, it keeps the video too, and the frames never leave your computer.

A 10-minute session of a 6-joint arm at 50 statuses a second takes 1.6 MB.

## What Doesn't Count

A session shorter than 2 seconds leaves no try, and neither does one where no joint moves more than about 1°.

Real motors stay locked, so every session is on an emulated robot. Because the try has no Case, it isn't judged.

Read [Record a robot session as a try](/help/record-a-robot-session-as-a-try) in the help center for the steps.
