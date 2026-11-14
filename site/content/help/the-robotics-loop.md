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

Basecase lets you design a robot, test it under physics, teach it skills and build it in one app. You work through six stages, and what you learn in one stage feeds back into the others.

Basecase is a 3D CAD studio for robots, with an agent that designs alongside you. It runs on Apple silicon Macs and 64-bit Windows 11. You can also use it in a browser as the [web studio](/help/desktop-app-and-web-studio).

## The six stages

| Stage | What you do | Where it is |
|---|---|---|
| Design | Shape parts, place real servos, boards and sensors, or describe the robot to the agent | **Parts** and **Library** in the view rail, and the **Agent** tab |
| Engineer | Add joints, pose the robot, and check torque, range, stability and printability | The **Pose** and **Build** tabs |
| Simulate | Run the robot under MuJoCo physics, and try it on Cases | The **Simulate** tab, and **Play** ▸ **Cases** |
| Train | Teach the robot a skill, such as standing up or walking, or install one from Hugging Face | The **Train** section of the **Simulate** tab, and **Install Skill** in [[⌘K]] |
| Build | Clear the Checks, price every part and print the plates | The **Build** tab |
| Operate | Connect a robot, calibrate its servos and run Routines | **Play** ▸ **Operate** and **Play** ▸ **Routines** |

MuJoCo is the physics engine robotics labs use to test robots before they build them. Basecase runs it inside the app, on the same model it exports.

## How the stages loop

If something fails in Engineer, Simulate or Train, you go back to Design. For example, say a knee servo has to hold more than 60% of its stall torque while the robot stands on one leg. The **Servo torque** check fails in the **Build** tab. To fix it, go back to Design and choose a stronger servo.

Calibration sends data the other way, from a running robot back into the simulation. Basecase uses a camera to find each joint's zero and direction. Then it fits a model of each servo from an 18-second bench run, so the servos in the simulation move the way the real ones do. You train the robot on that calibrated simulation.

You can also [try a Case](/help/try-a-case-on-your-real-robot) with a real wheeled or legged robot, on a floor mat printed with the Case. Basecase watches the run through a camera and judges it by the same contract it uses in simulation.

## What works today

- Design and Engineer are complete.
- Simulate and Train are in active development.
- Build covers the Checks, the bill of materials, the build guide, slicing and print service quotes.
- Operate works against the simulation and an emulated robot.

**Note:** Basecase can watch a real robot through a camera, but it can't drive real motors.

For a short tour of the whole loop, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot).
