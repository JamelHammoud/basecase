---
title: The motor lock and safety ladder
date: 2026-11-13
updated: 2026-11-13
collection: operate
type: concept
order: 1
keywords:
  - safety
  - rungs
  - modes
  - look
  - set up
  - test
  - rehearse
  - first run
  - torque limit
  - watchdog
  - emergency stop
  - fault
related:
  - connect-an-emulated-robot
  - servo-readings-and-daemon-messages
covers:
  - src/components/operate/RobotLadder.tsx
  - src/robot/robotState.ts
  - hw/crates/robot-daemon/src/ladder/
  - hw/crates/robot-daemon/src/caps.rs
  - hw/crates/robot-daemon/src/fault.rs
  - hw/crates/robot-daemon/src/transport.rs
---

Basecase moves a motor only after the robot climbs a ladder of checks, and real motors stay locked in the build, not behind a setting.

A robot that runs a bad command can break itself, or hurt someone. So nothing in the app writes to a motor directly. Every command goes through the robot daemon, a small program with one safety layer that alone can write to a servo.

## The motor lock

Released builds of Basecase can't open a serial port at all. The code that talks to real servos is left out when the app is built. Asked for a port, the daemon exits with "Real motors are locked in this build."

The lock comes off at the first hardware session, when a maintainer turns it on with the power cut-off in reach. Until then, every robot in Operate is emulated. Nothing in Basecase has moved a real motor.

## The ladder

A robot climbs one rung at a time, and only the next rung, or **Look**, can be clicked. Each rung is earned by finishing the one below it; nothing can mark a rung done by hand.

| Rung | Needs | Motors |
|---|---|---|
| **Look** | Nothing | Off; the servos are only read |
| **Set Up** | Every servo answers with the right model, and no two share an ID | Off |
| **Test** | A calibration, and servo firmware the daemon knows | On, moving each joint slowly; done after 5 s with every joint moved |
| **Rehearse** | A passed Test, and a policy | Off; the policy runs for 10 s with no motor writes |
| **First Run** | A passed Rehearse | On, running the policy |
| **Policy** | A finished first run | On, for longer runs |
| **Longer Runs** | A finished policy run | On, with no time limit |

Changing the calibration, the policy or the servo firmware clears what it invalidates. A robot above **First Run** drops back to it and holds. Each new connection starts again from **Look**.

## Limits on each rung

| | Test | Rehearse | First Run | Policy | Longer Runs |
|---|---|---|---|---|---|
| Torque | 30% | 30% | 30% | 60% | 60% |
| Speed | 0.5 rad/s | 0.5 rad/s | 0.5 rad/s | 2 rad/s | 2 rad/s |
| Move per 20 ms | 0.02 rad | 0.02 rad | 0.02 rad | 0.05 rad | 0.05 rad |
| Run length | Until you stop | 10 s | 30 s | 5 min | No limit |

On every rung, a motor stops at 50 °C. The supply must stay between 6.0 and 8.4 V for Feetech servos, or 3.7 and 6.0 V for Dynamixel. A goal never leads the servo's measured position by more than 0.25 rad.

Starting the motors is gentle too. Torque starts at 5% and ramps up over 1 second, and a joint outside its calibrated range refuses to start.

## How it stops

The app must send a command at least every 100 ms while motors run. If it stops, the robot stops within 100 ms: an arm holds, and a legged robot stands still.

| What went wrong | What the daemon does |
|---|---|
| A servo stops answering, garbles its replies, or answers late | Stops every write at once |
| A servo overheats, stalls, moves the wrong way, or reports overload | Switches that motor off and holds the rest |
| The supply voltage is out of range, or a servo restarts | Switches every motor off |
| A joint leaves its calibrated range | Switches every motor off |
| A fall is reported | Lowers torque to 10% and holds |

A fault stays until you clear it. Climb back down to **Look**, click **Clear Fault**, and climb again. Until you climb, the simulation sends the robot no commands.

> [!WARNING]
> Feetech servos keep holding their last position if the daemon itself stops. On a real robot, do not touch it until you've switched off the servo power. Dynamixel servos stop on their own within 100 ms.

What each message means is in [Servo readings and daemon messages](/help/servo-readings-and-daemon-messages).
