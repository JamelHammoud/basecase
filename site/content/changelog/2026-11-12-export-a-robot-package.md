---
title: Export a robot package
date: 2026-11-12
---

Your robot can now leave Basecase as one zip that MuJoCo, ROS 2 and LeRobot read: the exact model Simulate runs, a URDF with meshes and masses, a servo joint map and its trained policies. Choose Export ▸ Robot Package, or Export Robot Package in ⌘K, once the scene has a movable joint.

## In ROS 2

The zip is also a ROS 2 description package, named after the robot (`arm_description` for a robot called arm). Unzip it into a colcon workspace's `src` folder, run `colcon build`, and `ros2 launch arm_description display.launch.py` opens RViz with the robot and a slider per joint. The URDF sits in `urdf/`, its meshes are referenced as `package://arm_description/meshes/…`, and a `ros2_control` block lists each movable joint with a position command and its limits, set to ROS 2's mock hardware until you swap in your driver. Basecase's CI builds these packages with `colcon build` and runs `check_urdf` on them in ROS 2 Jazzy whenever the export changes.
