---
title: Keep fleet problems with their tries
date: 2026-11-15
image: /changelog/retain-fleet-problems/cover.png
---

You can inspect a fault in a robot's Operate fleet row while the other robots keep running. The fault stays in that row so you can acknowledge it and open its recorded try.

An arm can stall while another arm continues its job. Before this update, after switching rows or restarting the studio, you could inspect only the current connection state.

The studio keeps up to 128 incidents and 256 KiB of history on this computer. For each incident, it keeps the unit, session, times, available design and policy fingerprints, and kept try. It updates one occurrence for repeated samples and starts a new one if the robot recovers and fails again.

Case contract conditions can raise incidents from supplied telemetry, including voltage. Missing readings and gaps over 500 ms break a pending duration. They don't count as recovery.

Acknowledging an active fault leaves it active. Opening a try requires a kept session and its saved recording, which must still exist.

Steps are in [Inspect fleet problems](/help/inspect-fleet-problems).
