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
covers:
  - src/types/robotics.ts
  - src/utils/kinematics.ts
  - src/utils/kinematicsLoop.ts
  - src/assembly/followers.ts
  - src/data/articulatedParts.ts
  - src/utils/robotImport/
  - docs/guide/joints-and-motion.md
---

Once a design has joints, you can pose it and simulate it. You can also check the load on every servo and the range of every joint.

## What a joint holds

Each joint has these fields:

| Field | What it says |
|---|---|
| Type | A revolute joint turns, measured in degrees. A prismatic joint slides, measured in millimeters. |
| Parent and child | Which parts stay still, and which parts move. |
| Pivot and axis | The point the joint turns around, and the line it turns along. If the joint has a servo, both come from the servo's real output. |
| Range | How far the joint can turn or slide in each direction. |
| Limb | Head, torso, left arm, and so on. The Pose tab groups joints by limb. |
| Servo | The actuator that drives the joint. Checks sizes it against the load. |

## Where joints come from

Joints come with a robot, a hand, or a design from the agent. You can also add them yourself:

- [Import a robot](/help/import-a-robot) brings in every joint from its URDF or MJCF file, including the axis, limits, and torque limit.
- **Parts** ▸ **Hands** lists posable hands whose makers publish their joints, such as LEAP, ORCA, and Allegro.
- The agent declares joints when it designs a robot. It also adds or changes joints when you ask it to.
- [Design a linkage from a path](/help/design-a-linkage-from-a-path) adds a four-bar linkage with a crank joint driven by a servo.
- [Join two parts with a hinge or slider](/help/join-two-parts-with-a-hinge) adds a joint between two parts you select.

As soon as the scene has a joint, the **Simulate** tab appears in the right panel.

## How parts follow their joints

Joints form a tree that starts at the robot's base and branches outward. Each part moves with the deepest joint that lists it as moving. For example, a hand moves with the wrist, and so it also moves with the elbow and the shoulder.

If no joint lists a part, the part still moves when its whole group moves with a joint. Screws, nuts, and inserts follow the parts they clamp, so you don't need to list them in any joint.

Each joint is anchored to the part it's mounted on. If you move the whole robot or undo a change, the joints stay in place.

A four-bar linkage forms a closed loop. You pose only its crank, and the coupler and rocker turn along with it so the loop stays closed. Simulate doesn't simulate closed loops. Instead, the coupler moves with the crank as a single rigid arm.

If you delete all of a joint's moving parts, Basecase deletes the joint too. Undo restores both.

## A pose never edits the design

The design keeps the pose you modeled the robot in. Posing changes only what you see on the canvas. To go back to the modeled pose, click **Rest pose**.

Measurements, clash checks, and range sweeps always use the modeled pose. If you move a part while the robot is posed, Basecase maps the move back to the modeled pose.

## Inverse kinematics

Walk cycles and poses from the agent set targets for hands and feet instead of angles. Inverse kinematics finds joint angles that reach each target while staying within every joint's range. Torso joints are stiffer, so the limbs move first to reach a target.

## Several robots in one scene

Basecase finds each robot in the scene separately, with its own joints, weight, and feet. The Pose tab, walk cycles, and Import BVH work only on the selected robot.
