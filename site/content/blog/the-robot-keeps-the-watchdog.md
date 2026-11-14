---
title: The robot keeps the watchdog
date: 2026-11-14
---

We put Basecase's daemon on the robot's computer, with a local network connection from the desktop app. The [network connection](/changelog/2026-11-14-connect-a-robot-computer) brings the existing mode ladder, joint readings and fault messages across that connection. Real motors remain locked, and the Linux daemon runs emulated robots.

## When the laptop leaves

An arm following a target from a laptop needs an answer when that laptop stops sending targets. Closing the lid, losing Wi-Fi and ending the app all remove the same source of commands. A stop button on the laptop can't help after the connection has gone.

The daemon already owns the motor write handle and the watchdog. We kept those on the robot computer. The app sends intents and heartbeats, while the daemon checks their freshness on its own control loop. The watchdog's limit remains 100 ms.

That limit starts a stop plan. An arm holds its position. A legged robot moves toward its standing pose within the existing motion caps, so completing that movement can take longer. The G1 returns its arms to its own controller. Losing a network connection doesn't grant a new path around those rules.

We kept the stdin connection too. An emulator started beside the app and a daemon reached over TCP use the same commands and ladder. A network connection begins at Look every time, including after a drop. Earlier ladder evidence doesn't carry a new connection into Test.

## Pairing before commands

Discovery answers a naming question. It tells the app which robots announced themselves nearby. A name on that list doesn't establish who controls the robot.

The daemon prints a six-digit code on its first start. Entering that code establishes a shared key through a password-authenticated exchange. The app invokes its shipped daemon for pairing, keeping both ends on the same Rust implementation.

After pairing, each connection gets a fresh random challenge. Signatures cover the challenge, sequence and exact command body. Telemetry has its own signature direction, so a captured status message can't become a command. The listener rejects malformed and oversized lines before command dispatch.

The connection accepts private and loopback addresses. The app checks every address returned for a host name and connects to the checked address directly. A public address mixed into a DNS answer refuses the connection.

## Installing what the scene knows

We used the existing Robot Package worker to make the installation's joint map. Its zeros, directions, names and ranges come from the same scene and calibration histories as an export. The installer derives the daemon's calibration from that map.

OpenSSH carries the Linux binary and those files to the computer. The installer checks the download's checksum and executable architecture, then checks that the binary refuses a real motor port. A user service starts the daemon, and lingering keeps that service alive after SSH disconnects.

Linux releases include static arm64 and x64 binaries. Static linking avoids requiring a Pi or Jetson image to match the release builder's glibc version. Native arm64 CI runs the fault tests, ladder model, safety properties and network tests.

The desktop app still supplies the intents in these builds. Running a trained policy onboard with the laptop gone remains separate work. For installation, pairing and reconnecting, follow [Connect a robot computer](/help/connect-a-robot-computer).
