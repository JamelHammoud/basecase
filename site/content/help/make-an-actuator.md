---
title: Make an actuator for a joint
date: 2026-11-13
collection: engineer
type: task
keywords:
  - actuator
  - cycloidal
  - cycloidal drive
  - reducer
  - gearbox
  - bldc
  - brushless motor
  - odrive
  - moteus
  - servo too weak
  - knee
related:
  - servo-torque-and-sizing
  - print-a-robots-parts
covers:
  - src/actuator/actuatorBuild.ts
  - src/actuator/pickActuator.ts
  - src/actuator/generated.ts
  - src/workspace/useMakeActuator.ts
  - vendor/robotics/mechanisms.scad
---

Replace a servo that's too weak for its joint with a printed cycloidal gearbox on a brushless motor, sized to the joint's load.

Make an Actuator is in the desktop app only. Every actuator is built around one motor, the 890 g ODrive D6374, so it's heavy for a small robot. Its driver needs a supply of at least 10 V, so a 7.4 V robot gets none.

1. Click the **Build** tab.
2. In **Checks**, click **Servo torque**.

   ![Servo torque open in Checks, with Make an Actuator beside the left knee's and right knee's items](/help/make-an-actuator/fix.png)

3. On the joint's item, click **Make an Actuator**.

   ![A box biped with the actuator on its left knee, outside the leg, and Servo torque now listing the left hip, right knee and left hip roll](/help/make-an-actuator/actuator.png)

The joint's servo is replaced by the motor, a reducer of six printed parts, and an mjbots moteus driver behind the motor. An AS5600 encoder board sits on the cover, and the bearings, screws and heat-set inserts come with it. The actuator sits on the joint's axis, outside the link it turns, with its output facing that link. Press [[⌘Z]] to put the servo back in one step.

The bill of materials lists the motor, driver, encoder, bearings and fasteners. The printed parts go on plates in Print mode.

You can also select a part of the joint's link and choose **Make an Actuator** in [[⌘K]], or ask the agent to make an actuator for the joint.

Basecase picks the lowest gear ratio of 10:1, 12:1, 15:1 or 20:1, then the smaller driver, that passes Servo torque. It plans for 1.5 times the joint's load, since the actuator adds about 1 kg. When a walk was simulated, it must also carry the walk's peak. The housing is about 85 mm across, and it must fit your printer's bed.

When nothing fits, the item says why instead: the housing is wider than the bed, the supply is outside 10–48 V, or even the strongest actuator stalls below the load. Making an actuator again on the same joint replaces the old one.

The torque is an estimate from the motor's current limits and the ratio, not a measurement. A 10:1 actuator on a moteus-c1 gives 9.92 N·m peak and 6.95 N·m rated, at 360 rpm on 24 V. The simulation uses the same peak torque, and the motor's inertia through the gears.

The extra weight moves the problem up the leg. On a long-legged biped with 12 V STS3215 servos and a 5.5 kg body, the left knee needs 1.96 N·m, 0.67 of the servo's stall, so it fails. A 10:1 actuator makes the knee pass. Then the left hip servo above it fails, and **Supply current** asks for about 21 A from the 10 A supply.

The driver and encoder aren't fastened to anything, and the housing needs a bracket to the link above it. **Parts attached** lists them until they're fastened.

The printed reducer hasn't been tested on a printer, so its backlash and efficiency aren't measured.

[Servo torque and sizing](/help/servo-torque-and-sizing) explains the limits each joint is graded against. Next, [print a robot's parts](/help/print-a-robots-parts).
