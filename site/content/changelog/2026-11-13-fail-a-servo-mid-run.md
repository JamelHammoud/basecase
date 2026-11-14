---
title: Fail a servo mid-run
date: 2026-11-13
image: /changelog/fail-a-servo-mid-run/cover.png
---

You can now break a servo while the simulation runs.

Right-click a joint and make its servo Limp, Weak, Stuck or Laggy. Then watch whether the robot still stands, walks or grips without it.

## Where it is

In the Simulate tab, right-click a row under Peak torque, or a part on the canvas that a joint moves, and open Fault. The Peak torque menu starts with the joint's name, so you know which servo you're about to break.

![The Fault menu on Leg2 bend, with Limp, Weak, Stuck, Laggy and Clear](/changelog/fail-a-servo-mid-run/menu.png)

## What each fault does

Limp takes away all of the servo's torque, so only the joint's own friction holds it. Weak halves the torque it can give. Stuck holds the joint where it is at full strength, whatever it's told. Laggy delays every command by 60 ms, on top of the servo's own measured delay. It starts from where the joint already is, so nothing jumps when you turn it on.

The joint's row shows the fault and moves to the top of Peak torque, even when the joint is doing no work. Clear puts the servo back exactly as it was.

A fault stays through Reset and Start over, the way a broken servo would. It ends when you end the simulation.

![A hexapod walking on five legs with Leg2 bend marked Limp](/changelog/fail-a-servo-mid-run/cover.png)

We checked it on the test robots. A crouched quadruped with one limp knee sinks and leans. A hexapod with a whole middle leg limp stays up.

## On a try

During a Case try, the try keeps every fault you set and the time it started. If you cleared a fault, the try keeps the time it ended too.

Each try row in Results shows its faults. Hover one and it names the joint and the time.

![A missed try marked Weak, with Arm1 at 1.3 s in its tooltip](/changelog/fail-a-servo-mid-run/results.png)

## What it doesn't do yet

A Case can't carry its own list of faults, and seeded runs don't break servos at random. Training doesn't drop a servo either, so a Walk can't learn to limp.

Read [Fail a servo mid-run](/help/fail-a-servo-mid-run) in the help center for the steps.
