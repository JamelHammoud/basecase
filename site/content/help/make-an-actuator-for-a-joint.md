---
title: Make an actuator for a joint
date: 2026-11-14
collection: engineer
type: task
order: 5
keywords:
  - actuator
  - cycloidal
  - cycloidal drive
  - reducer
  - gearbox
  - bldc
  - brushless motor
  - odrive d6374
  - moteus
  - quasi-direct drive
  - servo too weak
  - knee
related:
  - servo-torque-and-sizing
  - build-checks
covers:
  - src/actuators/pick.ts
  - src/actuators/withActuator.ts
  - src/actuators/actuatorParts.ts
  - src/actuators/cycloidal.ts
  - src/data/generatedActuators.ts
  - src/workspace/makeActuator.ts
  - src/workspace/actuatorCommands.tsx
  - vendor/robotics/mechanisms.scad
---

Replace a servo that Servo torque fails with a printed cycloidal gearbox around a brushless motor, sized to the joint's load and your printer's bed.

It works in the desktop app. The web demo doesn't show the button.

1. Click the **Build** tab.
2. In **Checks**, click **Servo torque**.
3. On the joint whose servo is too weak, click **Make an Actuator**.

![Servo torque open in Checks, with the left and right knees failing and Make an Actuator beside each](/help/make-an-actuator-for-a-joint/fix.png)

The servo is replaced on the joint's axis, and Checks run again on their own.

![The biped with a cycloidal actuator on its left knee, and only the right knee still failing in Servo torque](/help/make-an-actuator-for-a-joint/made.png)

You can also select the joint's servo, press [[⌘K]] and choose **Make an Actuator**, or ask the agent to make an actuator for the joint. Press [[⌘Z]] once to put the servo back.

## What you get

Each actuator is an ODrive D6374 150KV motor with a printed reducer on its front. The reducer is six printed parts: **Housing**, **Housing Cap**, **Disc A**, **Disc B**, **Output Ring** and **Input Shaft**. They go on the plates with the rest of your printed parts.

The bill of materials lists the bought parts for each actuator: the motor, an mjbots moteus r4.11 driver, an Adafruit AS5600 encoder that reads the output, two 6704 bearings, a 6800 and a 6805 bearing, four M4 × 10 and four M3 × 8 screws, and four M3 heat-set inserts.

The ratio is the lowest of 11, 13, 15, 17, 19, 21 and 25 to 1 that holds the joint's load. A 15:1 gives about 66.8 N·m of stall, 23.8 N·m rated and 240 rpm at 24 V. These torques are estimates, at 90% efficiency.

The simulation reads the same numbers, including the motor's inertia as the gearbox reflects it to the joint.

## Limits

The D6374 is the only motor it builds around today. If the actuator a joint needs is wider than your bed, nothing changes, and a message says how wide it is.

The driver sits behind the motor with no mount yet, so **Parts attached** lists it. The printed parts haven't been test-printed.

To learn how the load is measured, see [Servo torque and sizing](/help/servo-torque-and-sizing).
