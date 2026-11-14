---
title: Make a printed actuator for a weak joint
date: 2026-11-14
image: /changelog/make-an-actuator/cover.png
---

You can now replace a servo that fails Servo torque with a printed cycloidal gearbox around a brushless motor, sized to the joint. It works in the desktop app.

When a knee failed, the only fix Basecase offered was a bigger servo. Builders past their first legged robot often print a reducer around a brushless motor instead, as Berkeley Humanoid Lite does, but each of those designs fits one robot.

**Make an Actuator** sits on each failing joint in **Build** ▸ **Checks** ▸ **Servo torque**, and in [[⌘K]] with the joint's servo selected. It picks the lowest ratio from 11:1 to 25:1 that holds the joint's load, around an ODrive D6374. It checks the parts fit your printer's bed, then places the motor, a moteus driver, an AS5600 output encoder, bearings, screws and six printed parts on the joint's axis.

A 15:1 gives an estimated 66.8 N·m of stall and 240 rpm at 24 V. Servo torque, Peak torque and the simulation all read those numbers, along with the motor's inertia as the gearbox reflects it. The agent's `make_actuator` tool does the same.

The D6374 is the only motor so far, and the driver has no mount yet. The printed parts haven't been test-printed.

Steps are in [Make an actuator for a joint](/help/make-an-actuator-for-a-joint).
