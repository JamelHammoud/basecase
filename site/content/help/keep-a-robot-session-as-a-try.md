---
title: Keep a robot session as a try
date: 2026-11-14
collection: operate
type: task
order: 5
keywords:
  - record
  - teleop
  - demonstration
  - session
  - gamepad
  - recording
related:
  - open-a-try-from-any-scene
  - replay-a-robot-fault-in-the-simulation
covers:
  - electron/robot/operateRecorder.mjs
  - electron/robot/robotLink.mjs
  - src/workspace/useOperateTries.ts
  - src/robot/operateFeed.ts
  - src/robot/operateTry.ts
  - src/robot/operateVideo.ts
  - src/components/tries/TryTile.tsx
---

Every session on a connected robot becomes a try in the Library, so you can replay it or train on it later.

Each connected unit records its own session. A fault or disconnect ends only that unit's recording.

There is nothing to turn on. A session counts as a try when it lasts over 2 seconds and a joint moves more than half a degree.

1. Connect the emulated robot. See [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Move the robot. In **Look**, move the arm by hand. In **Test**, drive it from **Simulate** with the keys, a gamepad, a phone or your computer's camera.
3. End the session. Click **Look** on the **Ladder**, or click **Disconnect**. A fault also ends it.
4. Click **Library** in the view rail on the left.
5. Under **Tries**, click the robot. The session shows with the **Operate** label and the time it started.

![Tries with an Operate session beside the robot's other tries](/help/keep-a-robot-session-as-a-try/tries.png)

6. Click the session to open it on the timeline. Each joint's lane shows the angles the robot measured.

![An Operate session open on the timeline, with a lane for each joint](/help/keep-a-robot-session-as-a-try/timeline.png)

A session linked to a fault or Case alert also opens through **Open Try** in that unit's [retained problems](/help/inspect-fleet-problems). The incident keeps the link to that session, even after another session ends.

Climbing the **Ladder** keeps the same session going. Dropping to a lower rung ends it and starts a new one.

A session keeps the angles the robot measured and the commands Basecase sent. It also keeps the simulation's angles at the same moments and the raw values of the input that drove it. Those are a gamepad's sticks and buttons, a phone's tilt, or the body points your computer's camera found. A ROS 2 robot or a Unitree G1 adds each joint's speed and effort. A session that ran a trained policy keeps which policy it was.

When your computer's camera is on, the selected unit's session also keeps its video. The video stays on your computer with the try.

An amber warning mark on the tile flags a problem in the recording, such as missing frames. On the timeline, point at the same mark beside the segments to see what happened and when.

**Note:** Basecase judges a session only when a Case in the scene can judge it from what the session recorded, as in [Label a try](/help/label-a-try). Otherwise its tile shows no Passed or Missed until you right-click it and choose **Mark Passed** or **Mark Failed**. A session opens on the timeline only in the scene it was recorded from.
