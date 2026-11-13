---
title: Export a robot package
date: 2026-11-12
image: /changelog/export-a-robot-package/cover.png
---

Your robot can now leave Basecase as one zip that MuJoCo, ROS and LeRobot read: the exact model Simulate runs, a URDF with meshes and masses, a servo joint map and its trained policies. Choose Export ▸ Robot Package, or Export Robot Package in ⌘K, once the scene has a movable joint.

## Where it is

Click Export at the top right and choose Robot Package. It's greyed out until the scene has at least one movable joint, whether you built the robot yourself or imported one. A toast shows while it builds, then "Exported" with the package's name, and `<scene>-robot.zip` lands in your downloads. The work happens off the main thread, so the canvas keeps moving while a big robot packs.

![The toast after the SO-101 arm's package is saved](/changelog/export-a-robot-package/exported.png)

## What's in the zip

`robot.xml` is the MuJoCo model Simulate runs, byte for byte, with every collision hull written inline, so it loads in MuJoCo with no other file.

`robot.urdf` is for ROS and anything else that reads URDF. It has one link per body of the robot and one joint per movable joint, named the same as in `robot.xml`, with axes and limits, plus each link's mass, centre of mass and inertia. The masses add up to the Build tab's Weight check. Every part is a binary STL in `meshes/`, already placed in its link's frame, and shared between visual and collision.

`joint_map.json` lists each movable joint in order with a servo id from 1, the joint's names in the model and in your scene, its servo family (STS3215, XL330 or none), zero offset, direction, limits and the active calibration from Calibrate Servos. Its keys are the ones Basecase's robot daemon reads, so for a robot whose joints are all revolute with limits, the file works as that daemon's calibration file as is.

`policies/` holds one folder per policy you trained, each with the policy and a `spec.json` that lists its observations and actions by joint name, its default pose, scale and control rate.

## Same names everywhere

The model, the URDF, the joint map, the policies and LeRobot datasets recorded in Cases all use the same joint names, so a policy trained in Basecase and a dataset recorded from it line up with the robot description without renaming.

## What it doesn't include

ONNX copies of policies aren't in the zip, and the package always carries the whole scene's model in `robot.xml`, including any scenery you added for Simulate.
