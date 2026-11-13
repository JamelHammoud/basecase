---
title: Robot package contents
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: reference
order: 2
keywords:
  - mjcf
  - urdf
  - joint_map.json
  - spec.json
  - policy.json
  - stl meshes
  - zip
related:
  - export-a-robot-package
  - publish-a-dataset-to-hugging-face
covers:
  - src/sim/robotPackage/buildRobotPackage.ts
  - src/sim/robotPackage/jointMap.ts
  - src/sim/robotPackage/policyFiles.ts
  - src/utils/robotImport/urdfWriter.ts
---

Every file in the zip that Export ▸ Robot Package saves, and what each one holds.

The zip unpacks to one folder named `<scene>-robot`. Lengths are in metres and angles in radians, with Z up.

## Files

| File | What it holds |
|---|---|
| `robot.xml` | The MuJoCo model the Simulate tab runs, unchanged. Collision shapes are written inside it, so it needs no other file. It holds everything the simulation holds, scenery included. |
| `robot.urdf` | One link per body of the robot and one joint per link, named as in `robot.xml`. Each link has the mass of its parts, its centre of mass and its inertia. |
| `meshes/<part>.stl` | One binary STL per part, already placed in its link's frame. The URDF uses each one for both looks and collisions. |
| `joint_map.json` | One entry per movable joint: servo id, joint name, type, servo family, zero offset, direction, limits and the active calibration. |
| `policies/<id>/policy.json` | A trained policy as Basecase runs it, weights included. |
| `policies/<id>/spec.json` | What the policy reads and drives: its inputs and their sizes, the joints it moves by name, the default pose, the action scale and the control step. |

## joint_map.json

| Key | Meaning |
|---|---|
| `id` | The servo id, from 1 in joint order |
| `name` | The joint's name in `robot.xml` and `robot.urdf` |
| `joint` | The joint's label in the scene |
| `type` | `revolute`, `continuous` or `prismatic` |
| `family` | `sts3215`, `xl330`, or null for other servos |
| `zero_counts` | 2048, the default zero until calibration |
| `direction` | 1, the default until calibration |
| `min_rad`, `max_rad` | Limits of a joint that turns |
| `min_m`, `max_m` | Limits of a joint that slides |
| `calibration` | The servo's active calibration, or null |

## What's left out

Scenes with no trained policy have no `policies` folder. A policy whose file can't be found is left out. ONNX copies of policies aren't included.

To make the zip, follow [Export a robot package](/help/export-a-robot-package).
