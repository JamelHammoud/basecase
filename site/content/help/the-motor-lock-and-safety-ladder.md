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

Before Basecase moves a motor, the robot has to climb a ladder of checks. The lock on real motors lives in the build itself, so no setting can lift it.

A bad command can make a robot break itself or hurt someone. The app hands every command to the robot daemon, a small program with one safety layer. Only that layer can write to a servo.

## The motor lock

Released builds of Basecase ship without the code that talks to real servos, so they can't open a serial port. If you ask the daemon for a port, it exits with "Real motors are locked in this build."

A maintainer lifts the lock at the first hardware session, with the power cut-off in reach. Until then, every robot in Operate is emulated, and nothing in Basecase has moved a real motor.

## The ladder

A robot climbs one rung at a time. You can click the next rung and **Look**. To earn a rung, finish the one below it. No one can mark a rung done by hand.

| Rung | Needs | Motors |
|---|---|---|
| **Look** | Nothing | Off, read-only |
| **Set Up** | Every servo answers with the right model, and no two share an ID | Off |
| **Test** | A calibration, and servo firmware the daemon knows | On, moving each joint at low speed. Done after 5 s with every joint moved |
| **Rehearse** | A passed Test, and a policy | Off. The policy runs for 10 s with no motor writes |
| **First Run** | A passed Rehearse | On, running the policy |
| **Policy** | A finished first run | On, for longer runs |
| **Longer Runs** | A finished policy run | On, with no time limit |

If you change the calibration, the policy, or the servo firmware, Basecase clears whatever that change invalidates. A robot above **First Run** drops back to it and holds. Every time you connect, the robot starts again from **Look**.

## Limits on each rung

| | Test | Rehearse | First Run | Policy | Longer Runs |
|---|---|---|---|---|---|
| Torque | 30% | 30% | 30% | 60% | 60% |
| Speed | 0.5 rad/s | 0.5 rad/s | 0.5 rad/s | 2 rad/s | 2 rad/s |
| Move per 20 ms | 0.02 rad | 0.02 rad | 0.02 rad | 0.05 rad | 0.05 rad |
| Run length | Until you stop | 10 s | 30 s | 5 min | No limit |

These limits hold on every rung:

- A motor stops at 50 °C.
- The supply must stay between 6.0 and 8.4 V for Feetech servos, or between 3.7 and 6.0 V for Dynamixel.
- A goal never leads the servo's measured position by more than 0.25 rad.

Torque starts at 5% and ramps up over 1 second. A joint outside its calibrated range won't start.

## How it stops

While motors run, the app must send a command at least every 100 ms. If the commands stop, the robot stops within 100 ms: an arm holds, and a legged robot stands still.

| Problem | Daemon's response |
|---|---|
| A servo stops answering, garbles its replies, or answers late | Stops every write at once |
| A servo overheats, stalls, moves the wrong way, or reports overload | Switches that motor off and holds the rest |
| The supply voltage is out of range, or a servo restarts | Switches every motor off |
| A joint leaves its calibrated range | Switches every motor off |
| The daemon gets a fall report | Lowers torque to 10% and holds |

A fault stays until you clear it. Climb back down to **Look**, click **Clear Fault**, then climb the ladder again. The simulation sends the robot no commands until you do.

> [!WARNING]
> If the daemon itself stops, Feetech servos keep holding their last position. On a real robot, don't touch the robot until you've switched off the servo power. Dynamixel servos stop on their own within 100 ms.

To learn what each message means, see [Servo readings and daemon messages](/help/servo-readings-and-daemon-messages).
