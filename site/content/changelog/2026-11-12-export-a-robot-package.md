---
title: Export a robot package
date: 2026-11-12
image: /changelog/export-a-robot-package/cover.png
---

You can now take a robot out of Basecase as one zip for MuJoCo and ROS 2. It holds the MuJoCo model Simulate runs, a URDF with meshes and masses, a servo joint map and the trained policies.

Before, no export carried the sim model or its policies. Running a policy in another tool meant rebuilding the robot by hand and hoping the joint names matched.

## Where it is

Click Export at the top right and choose Robot Package, or Export Robot Package in ⌘K. It's greyed out until the scene has at least one movable joint, whether you built the robot yourself or imported one. A toast shows while it builds, then "Exported" with the package's name, and `<scene>-robot.zip` lands in your downloads. The work happens off the main thread, so the canvas keeps moving while a big robot packs.

![The toast after the SO-101 arm's package is saved](/changelog/export-a-robot-package/exported.png)

## What's in the zip

`robot.xml` is the MuJoCo model Simulate runs, byte for byte, with every collision hull written inline, so it loads in MuJoCo with no other file.

`urdf/robot.urdf` is for ROS and anything else that reads URDF. It has one link per body of the robot and one joint per movable joint, named the same as in `robot.xml`, with axes and limits. Each link carries its mass, centre of mass and inertia, and the masses add up to the Weight check's total. Every part is a binary STL in `meshes/`, already placed in its link's frame, and shared between visual and collision.

`joint_map.json` lists each movable joint in order with a servo id from 1. Each entry has the joint's names in the model and in your scene, its servo's bus (Feetech, Dynamixel or none) and the servo itself. Its zero offset, direction, limits and active calibration follow. Its keys are the ones Basecase's robot daemon reads. So for a robot whose joints are all revolute with limits, the file works as that daemon's calibration file as is.

`policies/` holds one folder per policy you trained. Each has the policy and a `spec.json` naming the joints its actions drive, its default pose, action scale, observations and control step.

## In ROS 2

The zip is also a ROS 2 description package, named after the robot: `arm_description` for a robot called arm. Unzip it into a colcon workspace's `src` folder, run `colcon build`, and `ros2 launch arm_description display.launch.py` opens RViz with the robot and a slider per joint. The URDF's meshes are referenced as `package://arm_description/meshes/…`. A `ros2_control` block lists each movable joint with a position command and its limits, on ROS 2's mock hardware until you swap in your driver. Basecase's CI builds these packages with `colcon build` and runs `check_urdf` on them in ROS 2 Jazzy.

## Same names everywhere

The model, the URDF, the joint map, the policies and LeRobot datasets recorded in Cases all use the same joint names, such as `j3_knee`. A policy trained in Basecase and a dataset recorded from it line up with the robot description without renaming.

## What it doesn't include

Zero offsets and directions in `joint_map.json` are defaults until they're measured on a real robot. ONNX copies of policies aren't in the zip. The package always carries the whole scene's model in `robot.xml`, including any scenery you added for Simulate.

Steps are in [Export a robot package](/help/export-a-robot-package).
