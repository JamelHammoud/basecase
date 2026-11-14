---
title: Servo torque and sizing
date: 2026-11-13
updated: 2026-11-14
collection: engineer
type: concept
order: 3
keywords:
  - servo sizing
  - actuator sizing
  - torque
  - stall torque
  - rated torque
  - n·m
  - kg·cm
  - holding torque
  - overload
  - overheat
  - stance
  - crouch
  - peak torque
  - motor selection
related:
  - build-checks
  - weight-and-center-of-mass
covers:
  - src/utils/actuatorRules.ts
  - src/utils/engineeringTorque.ts
  - src/utils/engineeringTorqueRows.ts
  - src/utils/engineeringCrouch.ts
  - src/utils/engineeringPeak.ts
  - src/utils/engineeringFalls.ts
  - src/utils/engineeringEnvelope.ts
  - src/utils/keySpecs.ts
  - docs/guide/build.md
---

Servo torque helps you pick servos that won't stall or overheat. It compares the torque each joint has to hold with the torque its servo gives at your supply voltage.

## What a servo can give

Every servo in **Parts** has two torque numbers from its datasheet. Stall torque is the most the servo can hold before it stops. Rated torque is what it can hold all day without overheating.

The check reads both numbers at the voltage your servo gets. That's the regulator's output. If there's no regulator, it's the battery's nominal voltage, and if there's no battery, it's the power supply's. If your voltage falls between two points on the datasheet, the check interpolates between them. It never rates torque above what the supply reaches. If a datasheet doesn't give a rated torque, the check uses a quarter of stall, and the row says so.

A servo's page in **Parts** shows its stall torque as a load. For example, the Feetech STS3215 holds “Up to 1.95 kg at 10 cm”.

## What a joint needs

A leg joint that swings forward and back has to carry the robot's whole weight on one leg, at the walk's crouch of at least 30°. On a robot with three or more legs, two legs share that load.

Every other joint has to hold its own limb anywhere in its range. If you import a robot that has no servos, the check grades its joints against the torque limit in its description.

## Pass, warn and fail

| Load | Pass | Warn | Fail |
|---|---|---|---|
| Leg joint at the crouch, as a share of stall | Up to 0.40 | Up to 0.60 | Above 0.60 |
| Leg joint heat, walking load against rated | Up to 1.0× | Up to 1.6× | Above 1.6× |
| Other joints, as a share of stall | Up to 0.40, and within rated | Between | Above 0.60 |
| Imported robot joints, against the torque limit | Up to half | Up to the limit | Above the limit |

These limits come from robots that walk. Under the older rule of a fifth of stall, every walking robot fails at the knee.

A failing joint is a blocker. If a joint has no servo data, it turns amber and shows up as “No torque data”.

## Reading a row

Click **Servo torque** under **Checks** in the Build tab. Each line names the joint, the torque it needs, its share of the servo's stall at your voltage, and its heat against rated. To select a servo, click its line.

## Peak torque, once it walks

After you have a trained walk policy, the agent can test it in simulation. The robot walks for 14 seconds, and the test pushes it twice with a force of 0.3 times the robot's weight. The test limits each servo to 0.7 of stall.

**Peak torque** fails if a joint asks for more than stall for over 50 ms, or if the robot falls. It warns above 0.8 of stall.

A servo can't give full torque and full speed at the same time. Its torque-speed line runs from stall at 0 rpm down to its no-load speed at your supply voltage. Peak torque also warns when more than 5% of a joint's walk lies past that line. The warning names the joint and the share.

In [Checks in the Build tab](/help/build-checks), open **Peak torque** to plot each joint's walk on its servo's line, next to the next stronger servo in the catalog.

## Falls, once the legs have servos

A fall hits a leg servo harder than walking does. **Falls** tips the robot over from 12 directions and compares each leg joint's torque with its rated torque. Up to 3× rated passes, up to 5× turns amber, and anything above 5× fails. If the datasheet gives a peak torque, the check uses it in place of the 5× limit. For the steps, see [Check what a fall does to the servos](/help/check-what-a-fall-does-to-the-servos).

## Making a joint pass

If a joint fails, change one of these:

- **A stronger servo.** Compare the strength on each servo's page in **Parts** ▸ **Servos**. A joint's plot under **Peak torque** names the next one up.
- **A shorter lever.** Torque grows with the distance from the joint to the load it holds.
- **A lighter robot.** Every leg joint carries the full weight.
- **A higher voltage,** inside the servo's range. The check reads torque at your supply voltage, so raising it can add torque.

To hand the problem to the agent, click **Fix** on a failing line.

If you're building an arm, [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) picks each joint's servo against these limits, with the payload at the wrist. Once the arm has joints, Servo torque grades it. [Design a robot from a motion clip](/help/design-a-robot-from-a-motion-clip) picks servos against the same limits, and each servo must also turn as fast as the clip needs.
