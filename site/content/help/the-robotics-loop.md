---
title: The robotics loop
date: 2026-11-13
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

With Basecase, you can design a robot, test it under physics, teach it skills and build it, all in one app. You work through six stages and carry what you learn in each one back into the others.

Basecase is a 3D CAD studio for robots, with an agent that designs alongside you. It runs on Apple silicon Macs and 64-bit Windows 11. You can also use it in a browser as the [web studio](/help/desktop-app-and-web-studio).

## The six stages

| Stage | What you do | Where it is |
|---|---|---|
| Design | Shape parts, place real servos, boards and sensors, or describe the robot to the agent | **Parts** and **Library** in the view rail, and the **Agent** tab |
| Engineer | Add joints, pose the robot, and check torque, range, stability and printability | The **Pose** and **Build** tabs |
| Simulate | Run the robot under MuJoCo physics, and try it on Cases | The **Simulate** tab, and **Play** ▸ **Cases** |
| Train | Teach the robot a skill, such as standing up or walking, train a policy on a dataset of your tries, or install one from Hugging Face | The **Train** section of the **Simulate** tab, a dataset in the **Library**, and **Install Skill** in [[⌘K]] |
| Build | Clear the Checks, price every part and print the plates | The **Build** tab |
| Operate | Connect emulated robots locally or on Linux computers, calibrate each unit, roll skills out to canaries and run Routines | **Play** ▸ **Operate** and **Play** ▸ **Routines** |

MuJoCo is the physics engine that robotics labs use to test robots before they build them. Basecase runs it inside the app, on the same model it exports.

You can also compare shared robots in [Leagues](/help/replay-a-league). Each League runs fixed robot revisions on one pinned Case. Frozen standings come from CI, and browser replays let you inspect a measured seed without changing the standings.

## How the stages loop

If something fails in Engineer, Simulate or Train, you go back to Design. For example, if a knee servo has to hold more than 60% of its stall torque while the robot stands on one leg, the **Servo torque** check fails in the **Build** tab. To fix it, go back to Design and choose a stronger servo.

Calibration sends data the other way, from a running robot back into the simulation. Basecase finds each joint's zero and direction from a camera. Then it fits each servo's model from an 18-second bench run, so the simulation moves the way the servo does.

A [body fit](/help/fit-a-robots-body-from-a-recorded-run) uses a recorded Operate run to fit link masses, terminal payloads and floor friction. It updates Checks and the model used for training. Policies trained on the previous body show **Out of date**.

You can also [try a Case](/help/try-a-case-on-your-real-robot) with a real wheeled or legged robot, on a floor mat printed with the Case. Basecase watches the run through a camera and judges it by the same contract as in simulation.

## What works today

- Design and Engineer are complete.
- Simulate and Train are in active development.
- The desktop app can [train on another computer](/help/train-on-another-computer) over SSH and recover the result after a restart. Arena judges it locally.
- Build covers the Checks, the bill of materials, the build guide, slicing and print service quotes.
- Operate connects fleets of emulated robots with separate calibrations and faults, locally or over a private network. [Connect a robot computer](/help/connect-a-robot-computer) installs the daemon as a Linux user service and pairs it with the app. [Roll Out](/help/roll-out-a-skill-to-a-fleet) proves each unit's twin before sending its policy.

**Note:** Basecase doesn't drive real motors, but it can watch a real robot through a camera.

For the quickest look at the loop, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot).
