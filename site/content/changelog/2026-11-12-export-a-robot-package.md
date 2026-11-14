---
title: Export a robot package
date: 2026-11-12
image: /changelog/export-a-robot-package/cover.png
---

You can now export a robot from Basecase as one zip for MuJoCo and ROS 2. It holds the MuJoCo model Simulate runs, a URDF with meshes and masses, a servo joint map and your trained policies.

Until now, no export carried the sim model or its policies. To run a policy in another tool, you had to rebuild the robot by hand and hope the joint names matched.

## Where it is

Click Export at the top right and choose Robot Package, or run Export Robot Package from ⌘K. It stays grayed out until the scene has at least one movable joint, whether you built the robot yourself or imported it.

A toast shows while the package builds. Then it says "Exported" with the package's name, and `<scene>-robot.zip` lands in your downloads. Basecase builds it off the main thread, so the canvas keeps moving while a big robot packs.

![The toast after the SO-101 arm's package is saved](/changelog/export-a-robot-package/exported.png)

## What's in the zip

`robot.xml` is the MuJoCo model Simulate runs, byte for byte. Every collision hull is written inline, so it loads in MuJoCo with no other file.

`urdf/robot.urdf` is for ROS and anything else that reads URDF. It has one link per body of the robot and one joint per movable joint, with axes and limits. The joints have the same names as in `robot.xml`. Each link carries its mass, center of mass and inertia, and the masses add up to the Weight check's total. Every part is a binary STL in `meshes/`, already placed in its link's frame and shared between visual and collision.

`joint_map.json` lists each movable joint in order, with servo ids starting from 1. Each entry has the joint's name in the model and in your scene, its servo's bus (Feetech, Dynamixel or none) and the servo itself. Then come its zero offset, direction, limits and active calibration. The keys are the ones Basecase's robot daemon reads. If every joint of your robot is revolute with limits, the file works as the daemon's calibration file as is.

`policies/` has a folder for each policy you trained. Each folder holds the policy and a `spec.json` with the joints its actions drive, its default pose, action scale, observations and control step.

## In ROS 2

The zip is also a ROS 2 description package, named after the robot. A robot called arm becomes `arm_description`.

Unzip it into the `src` folder of a colcon workspace and run `colcon build`. Then `ros2 launch arm_description display.launch.py` opens RViz with the robot and a slider for each joint.

The URDF references its meshes as `package://arm_description/meshes/…`. A `ros2_control` block lists each movable joint with a position command and its limits. It runs on ROS 2's mock hardware until you swap in your driver.

Basecase's CI builds these packages with `colcon build` and runs `check_urdf` on them in ROS 2 Jazzy.

## Same names everywhere

The model, the URDF, the joint map, the policies and LeRobot datasets recorded in Cases all use the same joint names, like `j3_knee`. So a policy you train in Basecase and a dataset you record from it line up with the robot description without any renaming.

## What it doesn't include

The zero offsets and directions in `joint_map.json` are defaults until you measure them on a real robot. ONNX copies of policies aren't in the zip. And `robot.xml` always carries the model of the whole scene, so any scenery you added for Simulate comes along.

Read [Export a robot package](/help/export-a-robot-package) in the help center for the steps.
