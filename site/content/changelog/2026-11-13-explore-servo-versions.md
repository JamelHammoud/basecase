---
title: Explore servo versions on a Case
date: 2026-11-13
image: /changelog/explore-servo-versions/cover.png
---

You can now run a Case on every catalog version of your robot's servos and supply voltage, then apply the winner in one undo step.

Open a Case in the Simulate tab and click **Explore** in its header, or find it in ⌘K. Results shows a row for each design with its passes, cost and mass, and you can sort by any of them.

Until now, picking a servo meant swapping a version by hand and trying the Case again. On a three-joint test arm with a 500 g hand on Touch the Dots, the STS3215 C001 shoulder passed 8 of 8 runs, and a C046 shoulder, geared 1:147 for speed, passed 1. With C018 servos on every joint, the arm passed none at 7.4 V and all 8 at 12 V.

Each design gets 8 seeded runs that vary friction, weight, servo strength and delay. Explore rates every servo at the row's voltage, the same way the Servo torque check does, and stops at 64 designs.

Click **Apply** and Basecase swaps the servos and the power supply's voltage, so the bill of materials and Checks update to match. Press ⌘Z to undo all of it.

Explore only works on Cases with one robot. A robot on a battery keeps the battery's voltage.

Ask the agent "which servo should I buy" and it answers with the same runs.

Read [Explore servo versions on a Case](/help/explore-servo-versions-on-a-case) in the help center for the steps.
