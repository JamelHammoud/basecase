---
title: Keep every robot session as a try
date: 2026-11-14
---

Every session on a connected robot is now kept as a try, with nothing to start. Moving the robot by hand in Look counts as a demonstration.

The tries show in **Library** ▸ **Tries**, badged Operate, beside the tries from your Cases.

A demonstration you drove with a gamepad or your camera used to be gone when you disconnected. Operate kept only the last 20 seconds, in memory, for Replay in Sim. Now the whole session is on disk, and Replay in Sim reads the try.

A try keeps each joint's measured position, plus velocity and effort when the robot reports them. An emulated ROS 2 arm reports both from its joint states. It keeps every command sent, the simulation's angles at the same moments, and the input's raw values. With your camera on, it keeps the video too, and the frames never leave your computer.

A session under 2 seconds, or where no joint moves more than about 1°, leaves no try. A 10-minute session of a 6-joint arm at 50 statuses a second takes 1.6 MB.

Real motors stay locked, so every session is on an emulated robot. The try has no Case, so it isn't judged.

Steps are in [Record a robot session as a try](/help/record-a-robot-session-as-a-try).
