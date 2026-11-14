---
title: Record a robot session as a try
date: 2026-11-14
collection: operate
type: task
order: 5
keywords:
  - teleop
  - demonstration
  - recording
  - episode
  - leader arm
  - gamepad
  - move by hand
  - dataset
related:
  - connect-an-emulated-robot
  - open-a-try-from-any-scene
  - replay-a-robot-fault-in-the-simulation
covers:
  - electron/robot/takeTap.mjs
  - electron/robot/robotTake.mjs
  - electron/robot/takeFiles.mjs
  - src/robot/takeVideo.ts
  - src/robot/robotStore.ts
  - src/sim/takeRecording.ts
---

Keep what a connected robot did as a try, to replay it on the timeline or train on it later.

Basecase records every session on a connected robot, with nothing to start. A session that runs under 2 seconds, or where no joint moves more than about 1°, leaves no try unless a fault ends it.

1. Connect the emulated robot. See [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Move the robot. Drive it from **Simulate** in **Test**, run a Case or a policy, or move its joints by hand in **Look**.
3. End the session. Click **Look** on the **Ladder** from a higher rung, or click **Disconnect**. A fault also ends it.
4. Click **Library** in the view rail on the left.
5. Under **Tries**, click the robot.
6. Click the try badged **Operate**. Its tile shows the time it started and how long it ran.
7. The try timeline opens with one lane per joint. The lanes show the measured angle, the command sent and the effort.

A try from **Operate** keeps each joint's measured position, and its velocity and effort when the robot reports them. It also keeps every command Basecase sent, the angles the simulation had at the same moments, and the raw values of the input that drove it. That input can be a gamepad's sticks, your phone's tilt, or the points your camera tracked on your body. When a trained policy runs at **Rehearse** or above, the try names it.

If you drive with your camera, the try keeps the camera's video too. The video stays on your computer.

**Note:** Real motors stay locked, so every session is on an emulated robot. The try has no Case, so it isn't marked Passed or Missed.

If Basecase quits during a session, it saves the session as a try the next time it starts.
