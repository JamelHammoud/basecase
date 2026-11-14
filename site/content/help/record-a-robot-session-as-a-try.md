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

You can keep what a connected robot did as a try, then replay it on the timeline.

Basecase records every session on a connected robot on its own. A session that runs under 2 seconds, or where no joint moves more than about 1°, doesn't leave a try unless a fault ends it.

1. Connect the emulated robot. See [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Move the robot. You can drive it from **Simulate** in **Test**, run a Case or a policy, or move its joints by hand in **Look**.
3. To end the session, click **Look** on the **Ladder** from a higher rung, or click **Disconnect**. A fault also ends the session.
4. Click **Library** in the view rail on the left.
5. Under **Tries**, click the robot.
6. Click the try with the **Operate** badge. Its tile shows the time it started and how long it ran.

![Tries with one Operate try from 3:23 AM that ran 12.7 s](/help/record-a-robot-session-as-a-try/tries.png)

7. The try timeline opens, with one lane for each joint. Each lane shows the measured angle, the command sent and the effort.

![The Operate try open on the timeline, with lanes for Shoulder and Elbow](/help/record-a-robot-session-as-a-try/timeline.png)

A try from **Operate** keeps each joint's measured position, plus its velocity and effort if the robot reports them. It also keeps every command Basecase sent and the angles the simulation had at the same moments. The try also keeps the raw values from whatever drove the robot: a gamepad's sticks, your phone's tilt, or the points your camera tracked on your body. If a trained policy runs at **Rehearse** or above, the try also records which policy file ran.

If you drive the robot with your camera, the try keeps up to 30 minutes of the camera's video. The video stays on your computer.

A session longer than 10 minutes shows in full on the timeline, but at fewer frames per second: a 30-minute session shows about 17 frames per second instead of 50.

**Note:** Real motors stay locked, so every session is on an emulated robot. Because the try has no Case, Basecase doesn't mark it Passed or Missed.

If Basecase quits during a session, it saves the session as a try the next time it starts.
