---
title: Check a robot's wiring on first power-on
date: 2026-11-22
collection: operate
type: task
order: 3
keywords:
  - first power on
  - swapped motors
  - reversed direction
  - wrong offset
  - wiring
  - check servos
  - first robot
related:
  - connect-an-emulated-robot
  - number-a-robots-servos
  - calibrate-an-emulated-robot
covers:
  - src/components/operate/PowerOnSection.tsx
  - src/robot/powerOn.ts
  - src/robot/powerOnCheck.ts
  - src/robot/calibrationSession.ts
  - src/workspace/operateCommands.tsx
  - src/workspace/calibrationActions.ts
  - electron/robot/emulatedHorns.mjs
---

Move each joint of an emulated robot once and find a swapped pair of motors, a reversed direction or a wrong offset before anything else runs.

This build keeps real motors locked, so Check Servos runs on emulated servos and the simulated network robot. It moves each joint 0.12 rad at no more than 0.24 rad/s, under Test's 0.5 rad/s speed cap.

1. Connect the robot from the scene you designed. For steps, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. In Operate, click **Set Up**, then click **Test**, then wait for "Motors running".
3. Click **Check Servos**.

![Operate in Test with Check Servos above Calibrate Servos](/help/check-a-robots-wiring-on-first-power-on/ready.png)

The highlighted row shows the joint that is moving and its bus ID. Click **Skip** to leave that joint for later. Check Servos then pauses, and clicking it again continues with the joints you haven't passed.

If the robot's wiring differs from the design, the check stops and names the joint.

4. Read the sentence under the ladder. It says which motor moves the wrong joint, which joint turns the wrong way, or which joint starts off zero.
5. Click **Fix**.

![Operate saying Elbow turns the wrong way, with Fix below it](/help/check-a-robots-wiring-on-first-power-on/reversed.png)

Fix changes the joint's zero and direction on the robot and records it as a new calibration version for that joint. For a swapped pair, it also swaps which joint each motor drives in Basecase. Roll Back on the joint's row undoes the calibration version.

6. Click **Check Servos** again.

After every joint passes, all the motors replay the same slow reference motion at once. The canvas draws the robot as measured beside the simulation. When each joint stays within 0.1 rad of the simulation, Operate reads "Matches the simulation."

![Operate reading Matches the simulation, with both joints Measured at v1](/help/check-a-robots-wiring-on-first-power-on/confirmed.png)

If a joint doesn't answer, shares its ID with another servo or strays from the simulation, the check stops and names it. Fix those joints first. See [Number a robot's servos](/help/number-a-robots-servos) for IDs.

**Check Servos** is also in [[⌘K]]. It appears there while a connected joint has no calibration record, or after a fix that hasn't been checked yet.

Disconnecting or leaving Test ends the check. The motors stop the same way they do for any other Test move.
