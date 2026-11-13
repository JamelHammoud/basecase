---
title: Fail a servo mid-run
date: 2026-11-13
image: /changelog/fail-a-servo-mid-run/cover.png
---

While the simulation runs, you can right-click a joint and make its servo Limp, Weak, Stuck or Laggy, then watch whether the robot still stands, walks or grips without it.

## Where it is

Right-click a row under Peak torque in the Simulate tab, or a part on the canvas that a joint moves, and open Fault. The joint's name heads the Peak torque menu, so you know which servo you're about to break.

![The Fault menu on Leg2 bend, with Limp, Weak, Stuck, Laggy and Clear](/changelog/fail-a-servo-mid-run/menu.png)

## What each fault does

Limp takes all of the servo's torque away, so only the joint's own friction holds it. Weak halves the torque it can give. Stuck holds the joint where it is, at full strength, whatever it's told. Laggy delays every command by 60 ms, on top of the servo's own measured delay, and starts from where the joint already is, so nothing jumps when you turn it on.

The joint's row shows the fault and moves to the top of Peak torque, even when it's doing no work. Clear puts the servo back exactly as it was. A fault stays through Reset and Start over, the way a broken servo would, and ends when you end the simulation.

![A hexapod walking on five legs with Leg2 bend marked Limp](/changelog/fail-a-servo-mid-run/cover.png)

We checked it on the test robots: a crouched quadruped with one limp knee sinks and leans, and a hexapod with a whole middle leg limp stays up.

## On a try

During a Case try, every fault you set is saved on the try with the time it started and, if you cleared it, the time it ended. Each try row in Results shows its faults, and hovering one names the joint and the time.

![A missed try marked Weak, with Arm1 at 1.3 s in its tooltip](/changelog/fail-a-servo-mid-run/results.png)

## What it doesn't do yet

A Case can't carry its own list of faults, seeded runs don't break servos at random, and training doesn't drop a servo so a Walk can learn to limp.
