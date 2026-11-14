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

Once a design has joints, you can pose it, simulate it, and check every servo's load and every joint's range.

## What a joint holds

| Field | What it says |
|---|---|
| Type | Revolute turns, measured in degrees. Prismatic slides, measured in millimeters. |
| Parent and child | The parts that stay, and the parts that move. |
| Pivot and axis | Where it turns and around which line. With a servo, both come from the servo's real output. |
| Range | How far it can turn or slide each way. |
| Limb | Head, torso, left arm and so on. The Pose tab groups joints by limb. |
| Servo | The actuator that drives it, which Checks size against the load. |

## Where joints come from

Joints arrive with a robot, a hand or the agent's design, or you add them yourself:

- [Import a robot](/help/import-a-robot) brings every joint in its URDF or MJCF, with axis, limits and torque limit.
- **Parts** ▸ **Hands** has posable hands whose makers publish their joints, such as LEAP, ORCA and Allegro.
- The agent declares joints when it designs a robot, and adds or changes them when you ask.
- [Design a robot from a motion](/help/design-a-robot-from-a-motion) places the fewest joints that replay a BVH clip, with a servo on each.
- [Design a linkage from a path](/help/design-a-linkage-from-a-path) adds a four-bar whose crank joint a servo drives.
- [Join two parts with a hinge or slider](/help/join-two-parts-with-a-hinge) adds a joint between two parts you select.

Once the scene has a joint, the **Simulate** tab appears in the right panel.

## How parts follow their joints

Joints form a tree from the robot's base outward. Each part moves with the deepest joint that lists it as moving. A hand moves with the wrist, and so with the elbow and the shoulder too.

A part that no joint lists still moves when its whole group moves with one joint. Screws, nuts and inserts follow whatever they clamp, so joints never need to list them.

Each joint is anchored to the part it's mounted on. Moving the whole robot, or undoing a change, keeps the joints in place.

A four-bar linkage closes a loop. You pose only its crank, and the coupler and rocker turn with it so the loop stays closed. Closed loops aren't simulated: in Simulate the coupler rides the crank as one rigid arm.

Deleting a joint's moving parts deletes the joint too. Undo brings both back together.

## A pose never edits the design

The pose you modeled is the design. Posing only changes what the canvas shows, and you can return to it with **Rest pose**.

Measurements, clash checks and range sweeps always run in the modeled pose. If you move a part while the robot is posed, the move is mapped back to the modeled pose.

## Inverse kinematics

Walk cycles and the agent's poses set targets for hands and feet rather than angles. Inverse kinematics finds joint angles that reach each target within every joint's range. Torso joints are stiffer, so the limbs reach first.

## Several robots in one scene

Each robot is found on its own, with its own joints, weight and feet. The Pose tab, walk cycles and Import BVH work on the selected robot only.
