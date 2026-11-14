---
title: Keep every robot session as a try
date: 2026-11-14
image: /changelog/keep-every-robot-session-as-a-try/cover.png
---

Every session on a connected robot is now a try in **Library** ▸ **Tries**, with nothing to turn on. That includes moving the arm by hand in Look.

Driving a robot from a gamepad, a phone or the Mac's camera is a demonstration you can train on. Until now, Operate kept only the last 20 seconds in memory, for Replay in Sim after a fault.

A session becomes a try when it lasts over 2 seconds and a joint moves more than 0.6°. It ends when you drop a rung, disconnect or a fault stops a motor. The try keeps the measured angles, the commands sent, the simulation's angles and the raw input values. A ROS 2 robot or a Unitree G1 adds each joint's speed and effort. The camera's video stays on your Mac.

Replay in Sim now reads the last 20 seconds from the try. A 10-minute session of a six-servo arm takes about 3 MB.

Basecase doesn't judge these tries, and they open on the timeline only in the scene they came from. Real motors stay locked, so today the robot is emulated.

Read [Keep a robot session as a try](/help/keep-a-robot-session-as-a-try) for the steps.
