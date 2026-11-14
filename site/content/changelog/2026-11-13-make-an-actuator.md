---
title: Make an actuator for a joint no servo can drive
date: 2026-11-13
image: /changelog/make-an-actuator/cover.png
---

You can now replace a servo too weak for its joint with a printed cycloidal actuator, from its Servo torque item in the Build tab. It works in the desktop app only.

A long-legged biped on 12 V STS3215 servos, carrying a 5.5 kg body, needs 1.96 N·m at the knee. That's 0.67 of the servo's stall, so the knee fails. Make an Actuator puts a 10:1 actuator there, and the knee passes.

The actuator is an ODrive D6374 brushless motor under a reducer of six printed parts, with an mjbots moteus driver and an AS5600 encoder. The driver needs at least 10 V, so a 7.4 V robot gets no actuator. Basecase picks the lowest ratio, from 10:1 to 20:1, then the smaller driver, that passes Servo torque with 1.5 times the load. The housing is about 85 mm across and must fit your printer's bed.

It lands on the joint's axis in one undo step. The motor, driver, bearings and screws go on the bill of materials, and the printed parts on plates. The simulation reads its peak torque and its motor's inertia through the gears. The agent's `make_actuator` tool does the same.

The torque is an estimate from the motor's and driver's current limits. We haven't printed the reducer and measured its backlash or efficiency. Every actuator uses the same 890 g motor, so it adds about 1 kg. On the biped, the hip servo above the knee then fails. The driver and encoder aren't fastened to anything, and the housing needs a bracket to the link above.

Steps are in [Make an actuator for a joint](/help/make-an-actuator).
