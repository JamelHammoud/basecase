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
  - src/components/RobotsPanel.tsx
  - src/utils/robotImport/presets.ts
  - src/workspace/useRobotInsert.ts
  - src/components/PosePanel.tsx
  - src/components/pose/JointRow.tsx
  - src/components/SimulatePanel.tsx
  - src/components/simulate/SimControls.tsx
  - src/components/simulate/ControlSection.tsx
---

Put a six-joint SO-101 arm in a new scene, bend its joints, and run it under MuJoCo physics.

By the end, the arm holds a pose you set, then folds under its own weight when you switch its motors off. It works in the desktop app and the web studio. Basecase downloads the arm's model from GitHub, so you need an internet connection.

## Add the arm

1. Click **+** after the last tab at the top of the window. A blank scene named Untitled opens.
2. Click **Robots** in the view rail on the left, the second icon from the top.
3. Under **Arms**, click **SO-101 Arm**.

The arm appears on the canvas, selected. A toast at the bottom says how many joints it has.

## Pose it

1. Click **Pose** at the top of the right panel.
2. Drag the slider in the first joint's row. The arm turns on the canvas as you drag.
3. Click the number at the end of another joint's row, type `45`, and press Enter.

Double-click a slider to send its joint back to 0. Posing never changes the parts; it only moves them on the canvas.

## Simulate it

1. Click **Simulate** at the top of the right panel.
2. Click the blue **Simulate** button. The arm starts under physics and holds the pose you set, while the clock beside the controls counts up.
3. Under **Control**, choose **Limp**. The motors let go, and the arm folds down.
4. Click **Reset** to start again from your pose.
5. Click **Stop simulation** to go back to editing.

Your scene saves itself as you work. Press [[⌘O]] to find it again later in the Scenes menu.

Next, [design a robot with the agent](/help/design-a-robot-with-the-agent), or [get a robot ready to build](/help/get-a-robot-ready-to-build).
