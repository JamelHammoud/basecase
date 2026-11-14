---
title: Pose and simulate your first robot
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: task
order: 2
popular: true
keywords:
  - tutorial
  - first project
  - quick start
  - getting started
  - so-101
  - mujoco
related:
  - the-robotics-loop
  - design-a-robot-with-the-agent
covers:
  - src/components/parts/robotViews.tsx
  - src/utils/robotImport/presets.ts
  - src/workspace/useRobotInsert.ts
  - src/components/PosePanel.tsx
  - src/components/pose/JointRow.tsx
  - src/components/SimulatePanel.tsx
  - src/components/simulate/SimControls.tsx
  - src/components/simulate/ControlSection.tsx
---

Add a six-joint SO-101 arm to a new scene, bend its joints, and run it under MuJoCo physics. In the simulation, the arm holds the pose you set, and when you switch its motors off, it folds under its own weight.

You can follow these steps in the desktop app or the web studio. Basecase downloads the arm's model from GitHub, so you'll need an internet connection.

## Add the arm

1. Click **+** after the last tab at the top of the window. A blank scene named Untitled opens.
2. In the view rail on the left, click **Parts**. It's the first icon from the top.
3. Under **Robots**, click **Arms**.
4. Click **SO-101 Arm**.

The arm appears on the canvas, selected. A toast at the bottom shows how many joints it has.

## Pose it

1. Click **Pose** at the top of the right panel.
2. Drag the slider in the first joint's row. The arm turns on the canvas as you drag.
3. Click the number at the end of another joint's row, type `45`, then press [[↩]].

To send a joint back to 0, double-click its slider. Posing moves the parts on the canvas without changing them.

## Simulate it

1. Click **Simulate** at the top of the right panel.
2. Click the blue **Simulate** button. The arm starts running under physics and holds the pose you set. The clock beside the controls counts up.
3. Under **Control**, choose **Limp**. The motors let go and the arm folds down.
4. To start again from your pose, click **Reset**.
5. To go back to editing, click **Stop simulation**.

Basecase saves your scene as you work. To find it again later, press [[⌘O]] and look in the Scenes menu.

Next, you can [design a robot with the agent](/help/design-a-robot-with-the-agent), or [get a robot ready to build](/help/get-a-robot-ready-to-build).
