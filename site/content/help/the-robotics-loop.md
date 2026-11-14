---
title: The robotics loop
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: concept
order: 1
keywords:
  - what is basecase
  - overview
  - workflow
  - stages
related:
  - pose-and-simulate-your-first-robot
  - the-basecase-window
covers:
  - docs/Robotics loop.md
  - src/workspace/ViewRail.tsx
  - src/workspace/RightPanelTabs.tsx
  - src/components/PlayTabs.tsx
---

Design a robot, test it under physics, teach it skills and build it in one app, through six stages that feed back into each other.

Basecase is a 3D CAD studio for robots, with an agent that designs alongside you. It runs on Apple silicon Macs and 64-bit Windows 11, and in a browser as the [web studio](/help/desktop-app-and-web-studio).

## The six stages

| Stage | What you do | Where it is |
|---|---|---|
| Design | Shape parts, place real servos, boards and sensors, or describe the robot to the agent | **Parts**, **Robots**, **Objects** and **Library** in the view rail, and the **Agent** tab |
| Engineer | Add joints, pose the robot, and check torque, range, stability and printability | The **Pose** and **Build** tabs |
| Simulate | Run the robot under MuJoCo physics, and try it on Cases | The **Simulate** tab, and **Play** ▸ **Cases** |
| Train | Teach the robot a skill, such as standing up or walking, or install one from Hugging Face | The **Train** section of the **Simulate** tab, and **Install Skill** in [[⌘K]] |
| Build | Clear the Checks, price every part and print the plates | The **Build** tab |
| Operate | Connect a robot, calibrate its servos and run Routines | **Play** ▸ **Operate** and **Play** ▸ **Routines** |

MuJoCo is the physics engine robotics labs use to test robots before they build them. Basecase runs it inside the app, on the same model it exports.

## How the stages loop

A failure in Engineer, Simulate or Train sends you back to Design. Say a knee servo has to hold more than 60% of its stall torque while the robot stands on one leg. The **Servo torque** check fails in the **Build** tab, and the fix is a stronger servo in Design.

Data from a running robot loops back the other way. Calibrating a servo fits its model from an 18-second bench run, so the simulation moves the way the servo does. Training then runs on that fit.

## What works today

Design and Engineer are complete. Simulate and Train are in active development. Build covers the Checks, the bill of materials, the build guide and slicing.

Operate works against the simulation and an emulated robot. Basecase doesn't drive real motors.

The quickest way to see the loop is to [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot).
