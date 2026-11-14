---
title: Joints and kinematics
date: 2026-11-13
updated: 2026-11-14
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
covers:
  - src/types/robotics.ts
  - src/utils/kinematics.ts
  - src/utils/kinematicsLoop.ts
  - src/assembly/followers.ts
  - src/data/articulatedParts.ts
  - src/utils/robotImport/
  - docs/guide/joints-and-motion.md
---

Once a design has joints, you can pose it, simulate it, and check the load on every servo and the range of every joint.

## What a joint holds

Every joint has the following fields:

| Field | What it says |
|---|---|
| Type | A revolute joint turns, measured in degrees. A prismatic joint slides, measured in millimeters. |
| Parent and child | Which parts stay still and which parts move. |
| Pivot and axis | The point the joint turns around and the line it turns along. If the joint has a servo, both come from the servo's real output. |
| Range | How far the joint can turn or slide in each direction. |
| Limb | Head, torso, left arm and so on. The Pose tab groups joints by limb. |
| Servo | The actuator that drives the joint. Checks sizes it against the load. |

## Where joints come from

Robots, hands and designs from the agent come with joints. You can also add joints yourself:

- [Import a robot](/help/import-a-robot) brings in every joint from its URDF or MJCF file, including the axis, the limits and the torque limit.
- **Parts** ▸ **Hands** lists posable hands whose makers publish their joints, such as LEAP, ORCA and Allegro.
- The agent declares joints when it designs a robot. It also adds or changes joints when you ask.
- [Design a linkage from a path](/help/design-a-linkage-from-a-path) adds a four-bar linkage with a crank joint driven by a servo.
- [Join two parts with a hinge or slider](/help/join-two-parts-with-a-hinge) adds a joint between two parts you select.

When the scene has at least one joint, the **Simulate** tab appears in the right panel.

## How parts follow their joints

Joints form a tree that starts at the robot's base and branches out from there. Each part moves with the deepest joint that lists it as moving. For example, a hand moves with the wrist, so it also moves with the elbow and the shoulder.

A part that no joint lists still moves when its whole group moves with a joint. Screws, nuts and inserts follow the parts they clamp, so you don't need to add them to any joint.

Each joint is anchored to the part it's mounted on. If you move the whole robot or undo a change, the joints stay where they are.

A four-bar linkage is a closed loop. You pose only its crank, and the coupler and rocker turn with it to keep the loop closed. Simulate doesn't simulate closed loops, so in Simulate the coupler moves with the crank as one rigid arm.

In a [generated actuator](/help/make-an-actuator-for-a-joint), only the output ring moves with the joint. The discs and the input shaft turn inside the gearbox, so range sweeps leave them out.

If you delete all of a joint's moving parts, Basecase deletes the joint too. Undo brings back both.

## A pose never edits the design

The design keeps the pose you modeled the robot in. Posing only changes what you see on the canvas. To return to the modeled pose, click **Rest pose**.

Measurements, clash checks and range sweeps always use the modeled pose. If you move a part while the robot is posed, Basecase maps the move back to the modeled pose.

## Inverse kinematics

Walk cycles and poses from the agent set targets for hands and feet. Inverse kinematics finds the joint angles that reach each target while keeping every joint within its range. Torso joints are stiffer, so the limbs move first to reach a target.

## Several robots in one scene

Basecase finds each robot in the scene separately, with its own joints, weight and feet. The Pose tab, walk cycles and Import BVH only work on the selected robot.
