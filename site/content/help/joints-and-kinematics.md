---
title: Joints and kinematics
date: 2026-11-13
updated: 2026-11-13
collection: engineer
type: concept
order: 1
keywords:
  - joint
  - joints
  - revolute
  - prismatic
  - hinge
  - slider
  - degrees of freedom
  - dof
  - kinematic chain
  - forward kinematics
  - inverse kinematics
  - ik
  - limits
  - range
  - limb
related:
  - pose-a-robot
  - servo-torque-and-sizing
  - design-a-robot-from-a-motion
covers:
  - src/types/robotics.ts
  - src/utils/kinematics.ts
  - src/utils/kinematicsLoop.ts
  - src/assembly/followers.ts
  - src/data/articulatedParts.ts
  - src/utils/robotImport/
  - docs/guide/joints-and-motion.md
---

Once your design has joints, you can pose it, simulate it, and check each servo's load and each joint's range.

## What a joint holds

A joint has these fields:

| Field | Meaning |
|---|---|
| Type | A revolute joint turns, measured in degrees. A prismatic joint slides, measured in millimeters. |
| Parent and child | The parts that stay still, and the parts that move. |
| Pivot and axis | The point the joint turns around, and the line it turns along. If a joint has a servo, it takes both from the servo's real output. |
| Range | How far the joint can turn or slide in each direction. |
| Limb | Head, torso, left arm, and so on. The Pose tab groups joints by limb. |
| Servo | The actuator that drives the joint. Checks sizes it against the load. |

## Where joints come from

Robots, hands, and designs from the agent come with their joints. You can also add your own.

- [Import a robot](/help/import-a-robot) brings in every joint from the robot's URDF or MJCF file, along with its axis, limits, and torque limit.
- **Parts** ▸ **Hands** lists posable hands whose makers publish their joints, such as LEAP, ORCA, and Allegro.
- The agent declares joints when it designs a robot, and adds or changes joints when you ask.
- [Design a robot from a motion](/help/design-a-robot-from-a-motion) places the fewest joints that can replay a BVH clip, and puts a servo on each one.
- [Design a linkage from a path](/help/design-a-linkage-from-a-path) adds a four-bar linkage with a crank joint that a servo drives.
- [Join two parts with a hinge or slider](/help/join-two-parts-with-a-hinge) adds a joint between two parts you select.

When the scene has at least one joint, the **Simulate** tab appears in the right panel.

## How parts follow their joints

Joints form a tree that starts at the robot's base and branches outward. Each part moves with the deepest joint that lists it as moving. For example, a hand moves with the wrist, so it moves with the elbow and the shoulder too.

A part that no joint lists still moves when a joint moves its whole group. Screws, nuts, and inserts follow the parts they clamp, so you don't need to add them to your joints.

Basecase anchors each joint to the part it's mounted on, so the joints stay in place when you move the whole robot or undo a change.

A four-bar linkage forms a closed loop. You pose only the crank, and the coupler and rocker turn with it to keep the loop closed. Simulate can't model closed loops, so it moves the coupler with the crank as one rigid arm.

If you delete all of a joint's moving parts, Basecase deletes the joint too. Undo brings back both.

## A pose never edits the design

Your design keeps the pose you modeled the robot in. Posing changes only what the canvas shows, and **Rest pose** returns to the modeled pose.

Measurements, clash checks, and range sweeps use the modeled pose, even while the robot is posed. If you move a part while the robot is posed, Basecase maps the move back to the modeled pose.

## Inverse kinematics

Walk cycles and poses from the agent set targets for hands and feet. Inverse kinematics finds the joint angles that reach each target and keeps every joint within its range. Because torso joints are stiffer, the limbs move first to reach a target.

## Several robots in one scene

Basecase finds each robot in the scene separately, with its own joints, weight, and feet. The Pose tab, walk cycles, and Import BVH work only on the selected robot.
