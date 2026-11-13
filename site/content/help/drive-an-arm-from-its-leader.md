---
title: Drive an arm from its leader
date: 2026-11-13
collection: operate
type: task
keywords:
  - leader arm
  - follower
  - teleop
  - teleoperation
  - so-101
  - gello
  - demonstrations
related:
  - make-a-leader-arm
  - export-a-lerobot-dataset
covers:
  - src/leader/leaderDrive.ts
  - src/robot/leaderStore.ts
  - src/workspace/inputCommands.tsx
  - electron/robot/robotRoutes.mjs
---

Move an arm in the simulation joint for joint by moving its leader arm, with the leader's trigger closing the gripper.

The leader connects as an emulated robot, since real servos stay locked. An emulated leader holds its rest pose, so the arm follows only the readings the leader sends.

1. Make a leader for the arm, as in [Make a leader arm](/help/make-a-leader-arm), and leave its tab open.
2. Go back to the arm's tab.
3. Press ⌘K and choose **Connect Leader**.
4. Hold the leader in the arm's rest pose.
5. Click **Simulate**, then **Drive**. The arm takes the leader's pose at this moment as its zero.
6. Move the leader. Each joint of the arm turns as far as its leader joint does.
7. Press Esc to stop driving, then press ⌘K and choose **Disconnect Leader**.

![Connect Leader in ⌘K, with the SO-101 Arm and its leader open in two tabs](/help/drive-an-arm-from-its-leader/command.png)

![The arm driving from its leader's readings in Simulate](/help/drive-an-arm-from-its-leader/following.png)

The leader stays in Look with its motors off, and Basecase never sends it a command. There's no offset to set by hand: both arms start from their rest poses. A trigger pulled 40° closes the gripper fully. Each joint moves at up to 270° a second within its limits.

A Case try driven this way records like any other, so [Export a LeRobot dataset](/help/export-a-lerobot-dataset) turns it into a demonstration.
