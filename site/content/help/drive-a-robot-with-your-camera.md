---
title: Drive a robot with your camera
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - camera
  - webcam
  - pose
  - arms
  - humanoid
  - teleop
  - mirror
  - motion capture
related:
  - drive-a-robot-in-the-simulation
  - try-a-case
  - teach-a-robot-a-gesture
  - export-a-lerobot-dataset
covers:
  - src/components/simulate/driveWithCamera.ts
  - src/workspace/inputCommands.tsx
  - src/cameras/operator/operatorCamera.ts
  - src/cameras/operator/poseFollow.ts
  - src/sim/drivePose.ts
  - src/components/cameras/OperatorTile.tsx
---

Move your arms in front of the computer's camera, and a humanoid or a robot arm in the simulation moves its arms the same way.

It works on humanoids and fixed arms. A rover or a robot with legs and no arms drives as it does with **Drive**, and the camera stays off. The camera's picture stays on your computer and is never saved.

1. Click **Simulate** at the top of the right panel.
2. In **Control**, click **Drive with Camera**.

![Drive with Camera in the Control section of the Simulate tab](/help/drive-a-robot-with-your-camera/control.png)

3. The first time, allow Basecase to use the camera.
4. Step back until the camera sees you from the hips up.
5. Hold still with your arms down for a moment.
6. Move your arms.

![The camera's tile with your skeleton drawn over it, and the robot raising its right arm](/help/drive-a-robot-with-your-camera/driving.png)

Press [[Esc]] to stop. The camera turns off.

You can also press [[⌘K]] and choose **Drive with Camera**.

## What follows you

| Robot | What moves |
|---|---|
| Humanoid | Its arms, waist and head follow yours. Its legs stay still. |
| Fixed arm | Its hand follows your right hand as it moves away from your right shoulder, scaled to the arm's reach. Pinch your left thumb and index finger together to close its gripper. |

A humanoid with a ready Walk skill keeps standing on it, and [[W]] [[A]] [[S]] [[D]] still walk it. Without one, its base is held in place while you drive, so it can't fall over. It stays held after you stop, until you end the simulation.

The still moment in step 5 is your rest pose. If the robot doesn't move, put your arms down, hold still for a second, and try again.

With a Case open, **Drive with Camera** is in [[⌘K]] only; choose it, then click **Try It**. The try records like any other, so it can go into a dataset, as in [Export a LeRobot dataset](/help/export-a-lerobot-dataset).

While the camera drives, a wave, a clap or a nod is also an event the open Case can react to. [Teach a robot a gesture](/help/teach-a-robot-a-gesture) lists them and adds your own.
