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

Move your arms in front of your computer's camera, and a humanoid or a robot arm in the simulation moves its arms the same way.

This works on humanoids and fixed arms. A rover, or a robot with legs and no arms, drives the same way it does with **Drive**, and the camera stays off. The camera's picture stays on your computer, and Basecase never saves it.

1. Click **Simulate** at the top of the right panel.
2. In **Control**, click **Drive with Camera**.

![Drive with Camera in the Control section of the Simulate tab](/help/drive-a-robot-with-your-camera/control.png)

3. The first time you do this, allow Basecase to use the camera.
4. Step back until the camera can see you from the hips up.
5. Hold still with your arms down for a moment.
6. Move your arms.

![The camera's tile with your skeleton drawn over it, and the robot raising its right arm](/help/drive-a-robot-with-your-camera/driving.png)

To stop, press [[Esc]]. The camera turns off.

You can also press [[⌘K]] and choose **Drive with Camera**.

## What follows you

| Robot | What moves |
|---|---|
| Humanoid | Its arms, waist and head follow yours. Its legs stay still. |
| Fixed arm | Its hand follows your right hand as you move it away from your right shoulder, scaled to the arm's reach. To close its gripper, pinch your left thumb and index finger together. |

If a humanoid has a Walk skill that's ready, it keeps standing on that skill, and [[W]] [[A]] [[S]] [[D]] still walk it. If it doesn't, Basecase holds its base in place while you drive, so it can't fall over. The base stays held after you stop, until you end the simulation.

The moment you hold still in step 5 is your rest pose. If the robot doesn't move, put your arms down, hold still for a second, and try again.

If a Case is open, **Drive with Camera** is only in [[⌘K]]. Choose it there, then click **Try It**. Basecase records the try like any other, so it can go into a dataset. Learn more in [Export a LeRobot dataset](/help/export-a-lerobot-dataset).

While the camera is driving, a wave, a clap or a nod is also an event the open Case can react to. [Teach a robot a gesture](/help/teach-a-robot-a-gesture) lists these gestures and shows how to add your own.
