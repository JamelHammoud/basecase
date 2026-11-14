---
title: Connect an emulated ROS 2 robot
date: 2026-11-13
collection: operate
type: task
keywords:
  - ros 2
  - ros2_control
  - joint_states
  - forward position controller
  - joint trajectory controller
  - urdf
related:
  - connect-an-emulated-robot
  - drive-an-emulated-unitree-g1
covers:
  - electron/robot/ros2.mjs
  - electron/robot/robotSpec.mjs
  - src/robot/ros2.ts
  - src/robot/sceneRobot.ts
  - src/components/operate/ConnectRobotButton.tsx
  - hw/crates/robot-daemon/src/ros2/
  - hw/crates/servo-emu/src/ros2/
---

You can drive the robot in your scene as a ros2_control robot, the same way you'd drive a UR, Franka, or SO-101 arm through its ROS 2 controllers.

**Note:** The robot is emulated. The daemon talks to it over 127.0.0.1, and no released build reaches a real network. Operate is available only in the desktop app.

1. Open a scene with a robot that has joints. If you imported the robot from a URDF, it keeps the joint names from the URDF and publishes under them.
2. Click **Play** in the view rail, then click **Operate**.
3. Above **Connect Emulated Robot**, click **ROS 2**.

![Operate with ROS 2 chosen above Connect Emulated Robot](/help/connect-an-emulated-ros-2-robot/connect.png)

4. Click **Connect Emulated Robot**. The emulated robot publishes `/joint_states` and takes commands on `/forward_position_controller/commands`.
5. Under **Ladder**, click **Set Up**. Basecase matches joints by name and checks that the robot publishes every joint in your scene. If the robot is missing one of your joints, or publishes a joint your scene doesn't have, the message names that joint and nothing moves.
6. Click **Test**. For a ROS 2 robot, the ladder stops at Test.
7. Drive the robot from the Simulate tab, a Case try, or Drive. Each joint follows the simulation and goes through the same safety checks as emulated servos.

![The emulated ROS 2 robot following the simulation in Test](/help/connect-an-emulated-ros-2-robot/test.png)

8. Click **Stop**. The robot holds the last positions it measured, and the daemon stops sending to it. If the app stops sending commands, the robot holds on its own within 100 ms.

Basecase saves each session as a try, including each joint's velocity and effort from `/joint_states`. To learn more, see [Record a robot session as a try](/help/record-a-robot-session-as-a-try).

Any scene robot with up to 32 joints can connect this way. Servo calibration applies only to Feetech and Dynamixel servos.
