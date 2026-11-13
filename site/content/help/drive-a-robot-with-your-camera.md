---
title: Drive a robot with your camera
date: 2026-11-13
collection: simulate-and-train
type: task
order: 3
keywords:
  - webcam
  - facetime camera
  - teleop
  - teleoperation
  - pose
  - body tracking
  - motion capture
  - mocap
  - mediapipe
  - humanoid
  - mirror
covers:
  - src/cameras/operator/
  - src/components/cameras/OperatorTile.tsx
  - src/components/simulate/ControlSection.tsx
  - src/workspace/caseCommands.tsx
  - src/workspace/useCameraToast.ts
  - src/sim/driveBody.ts
  - src/sim/drivePose.ts
  - src/sim/useDriveSources.ts
  - electron/permissions.mjs
related:
  - drive-a-robot-in-the-simulation
  - run-a-case
---

Move your arms in front of the Mac's camera, and a humanoid or a fixed arm in the simulation follows them live.

1. Open a robot with arms: a humanoid, or an arm fixed to the ground.
2. Click **Simulate** at the top of the right panel, with no Case open.
3. In **Control**, click **Drive With Camera**. The first time, macOS asks whether Basecase can use the camera.

![The Control section with Drive With Camera under Teach It to Move](/help/drive-a-robot-with-your-camera/control.png)

4. Stand facing the camera with your shoulders, arms and hips in view, and hold still for a moment.
5. Move your arms. The robot's arms follow, and your camera shows at the top of **Cameras** with your skeleton drawn over it.

![A humanoid with its right arm raised, beside the camera tile and the Scene view](/help/drive-a-robot-with-your-camera/driving.png)

6. Press [[Esc]] to stop. The camera turns off.

**Drive With Camera** is also in [[⌘K]].

## What follows what

On a humanoid, every joint above the hips follows your upper body: shoulders, elbows, wrists, waist and head. Your forward is the robot's forward, so raise your right arm and the robot raises its right arm. Each joint stays inside its limits and turns at up to 240° a second.

On a fixed arm, the hand follows your right wrist. How far your hand is from your shoulder, as a share of your arm's length, sets how far the robot's hand is from its base, as a share of its reach.

On a robot with a gripper, pinch your left thumb and index finger together to close it. On a humanoid, that closes the gripper on each of its hands.

A robot with legs stands on its **Walk** skill when it has a ready one. Without one, its base is held in place, so it can't fall while you try the arms.

## Limits

Basecase follows one person. It sees each hand as four points, so single fingers don't move the robot. Frames stay on your Mac and are never saved or sent anywhere.

To record tries driven by the camera, run a Case that lists the camera among its inputs; see [Run a Case](/help/run-a-case). Each try records like any other, ready for Export Dataset.
