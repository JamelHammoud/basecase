---
title: Servo torque and sizing
date: 2026-11-13
updated: 2026-11-13
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
  - src/utils/keySpecs.ts
  - docs/guide/build.md
---

Pick servos that won't stall or overheat: Servo torque compares what each joint holds with what its servo gives at your supply voltage.

## What a servo can give

Every servo in **Parts** carries its datasheet's stall torque and rated torque. Stall is the most it can hold before it stops; rated is what it can hold all day without overheating.

Both are read at the voltage the servo actually gets: a regulator's output, else the battery's nominal voltage, else the tether's. Between the datasheet's voltage points the torque is interpolated, and it's never rated above what the supply reaches. When a datasheet gives no rated torque, a quarter of stall stands in, and the row says so.

A servo's page in **Parts** gives its stall torque as a load: the Feetech STS3215 holds “Up to 2 kg at 10 cm”.

## What a joint needs

Leg joints that swing forward and back carry the robot's whole weight on one leg, at the walk's crouch of at least 30°. A robot with three or more legs shares the load over two.

Every other joint has to hold its own limb, anywhere in its range. Joints of an imported robot with no servos are checked against the torque limit in its description instead.

## Pass, warn and fail

| Load | Pass | Warn | Fail |
|---|---|---|---|
| Leg joint at the crouch, as a share of stall | Up to 0.40 | Up to 0.60 | Above 0.60 |
| Leg joint heat, walking load against rated | Up to 1.0× | Up to 1.6× | Above 1.6× |
| Other joints, as a share of stall | Up to 0.40, and within rated | Between | Above 0.60 |
| Imported robot joints, against the torque limit | Up to half | Up to the limit | Above the limit |

These limits come from robots that walk. The older rule of a fifth of stall fails every walking robot at the knee.

A failing joint is a blocker. A joint with no servo data turns the row amber and is listed as “No torque data”.

## Reading a row

Click **Servo torque** under **Checks** in the Build tab. Each line names the joint, the torque it needs, its share of the servo's stall at your voltage, and its heat against rated. Clicking a line selects the servo.

## Peak torque, once it walks

After a walk policy is trained, the agent can test it in simulation. The robot walks for 14 seconds and takes two shoves of 0.3 times its weight, with each servo limited to 0.7 of stall.

**Peak torque** fails when a joint asks for more than stall for over 50 ms, or the robot falls. It warns above 0.8 of stall.

## Making a joint pass

- **A stronger servo.** Compare the strength on each servo's page in **Parts** ▸ **Servos**.
- **A shorter lever.** Torque grows with the distance from the joint to the load it holds.
- **A lighter robot.** Every leg joint carries the full weight.
- **A higher voltage,** inside the servo's range. Torque is read at your supply voltage, so a higher one can add torque.

**Fix**, on a failing line, hands the problem to the agent to solve.
