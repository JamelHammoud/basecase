---
title: Explore servo versions on a Case
date: 2026-11-13
image: /changelog/explore-servo-versions/cover.png
---

You can now run a Case on every catalog version of your robot's servos and supply voltage, then apply the winner in one undo step.

It's **Explore** in the open Case's header in the Simulate tab, and in ⌘K. The rows land in Results with passes, cost and mass, and sort by any of them.

Picking a servo used to mean swapping a version by hand and trying the Case again. On a three-joint test arm with a 500 g hand on Touch the Dots, the STS3215 C001 shoulder passed 8 of 8 runs. A C046 shoulder, geared 1:147 for speed, passed 1. C018 servos on every joint passed none at 7.4 V and all 8 at 12 V.

Each design gets 8 seeded runs, with friction, weight, servo strength and delay varied. Every servo is rated at the row's voltage, as the Servo torque check rates it. Explore stops at 64 designs. **Apply** swaps the servos and the tether's voltage, so the bill of materials and Checks follow, and ⌘Z puts it all back.

Only Cases with one robot can be explored. A robot on a battery keeps the battery's voltage. The agent answers "which servo should I buy" with the same runs.

Steps are in [Explore servo versions on a Case](/help/explore-servo-versions-on-a-case).
