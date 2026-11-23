---
title: Fail each servo in a Case
date: 2026-11-22
image: /changelog/fail-each-servo-in-a-case/cover.png
---

You can now add a broken servo to a Case, and Checks reports whether the design still passes without it. Each fault keeps its own row.

A knee that gives out on a quadruped is easy to miss in a clean run. Until now you could only click Fault during a live try and watch.

Open a Case in the Simulate tab and add a fault under Faults: a servo, then Limp, Weak, Stuck or Laggy. Under Checks, every entry gets a row below the Case's row. The row shows how many of the 20 seeded runs passed with that servo broken from the first moment. Click it, then click a red trail to open the failing seed with the same servo broken.

The list is saved with the Case. It goes with a shared Case and reopens with the scene. A fault applied in a live run can be added with **Fault** ▸ **Add to Case**. The agent's `create_case` takes the same list.

Faults are tried one at a time, so a row says what that single failure does. On the sample robots, a limp knee fails the quadruped's Walk Without Falling in all 20 runs, while the hexapod keeps passing on its other five legs.

A passing row is simulation evidence only. It doesn't count toward Ready to build, and Forge training doesn't apply Case faults.

Steps are in [Fail each servo in a Case](/help/fail-each-servo-in-a-case).
