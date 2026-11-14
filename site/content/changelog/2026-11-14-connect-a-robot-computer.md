---
title: Connect robots over your network
date: 2026-11-14
image: /changelog/connect-a-robot-computer/cover.png
---

You can now run a robot's daemon on a Linux computer and connect from Operate over your local network. Real motors stay locked.

The daemon belongs beside the robot when a laptop lid closes or Wi-Fi drops. Its watchdog starts the stop plan on that computer, without waiting for Basecase to reconnect.

In Operate, Add a Robot Computer takes the host, SSH user and key. Basecase copies the scene's joint map and calibration, verifies the Linux daemon download, and starts a user service. The robot appears by name, and a six-digit code pairs it once.

Linux releases include arm64 and x64 binaries. Feetech, Dynamixel, G1 and ROS 2 emulators use the existing ladder, caps and fault messages over the network. Reconnecting starts at Look.

The link accepts local addresses only. The default daemon still follows the app's intents, so it doesn't run a trained policy independently when the app leaves.

Steps and the terminal command are in [Connect a robot computer](/help/connect-a-robot-computer).
