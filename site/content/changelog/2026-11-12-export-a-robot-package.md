---
title: Export a robot package
date: 2026-11-12
image: /changelog/export-a-robot-package/cover.png
---

You can now take a robot out of Basecase as one zip for MuJoCo and ROS 2. It holds the MuJoCo model Simulate runs, a URDF with meshes and masses, a servo joint map and the trained policies.

Before, no export carried the sim model or its policies. Running a policy in another tool meant rebuilding the robot by hand and hoping the joint names matched.

Choose Export ▸ Robot Package, or Export Robot Package in ⌘K. It turns on once the scene has a movable joint.

`robot.xml` is the sim's model byte for byte, with its meshes inline, so MuJoCo loads it with no other file. The URDF, the joint map, the policies and LeRobot datasets share one set of joint names, such as `j3_knee`. The URDF's link masses add up to the Weight check's total.

The zip is also a ROS 2 description package, named after the robot: `arm_description` for a robot called arm. After `colcon build`, its launch file opens RViz with the robot and a slider per joint. A `ros2_control` block lists each movable joint with its limits, on ROS 2's mock hardware until you swap in your driver. Basecase's CI builds these packages and runs `check_urdf` on them in ROS 2 Jazzy.

Zero offsets and directions in `joint_map.json` are defaults until they're measured on a real robot. The ONNX file of each policy isn't in the zip.

Steps are in [Export a robot package](/help/export-a-robot-package).
