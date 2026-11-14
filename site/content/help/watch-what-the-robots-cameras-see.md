---
title: Watch what the robot's cameras see
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 10
keywords:
  - camera feed
  - wrist camera
  - head camera
  - fisheye
  - field of view
  - fov
  - lens
  - depth camera
  - /operate
related:
  - add-a-camera-view
  - lerobot-dataset-contents
covers:
  - src/components/cameras/CameraStrip.tsx
  - src/components/cameras/CameraTile.tsx
  - src/components/cameras/OperatorTile.tsx
  - src/components/cameras/cameraMenu.tsx
  - src/cameras/views.ts
  - src/cameras/lens.ts
  - src/cameras/optics.ts
  - src/workspace/viewCommands.tsx
  - src/agent/agentOperate.ts
---

Put a camera part on the robot and see its live view beside the canvas, through its real lens, while the simulation runs.

1. Click **Parts** in the view rail.
2. Open **Cameras**, or **Depth Cameras** for a depth sensor.
3. Drag the camera onto the robot, facing where it should look.
4. Find its live view under **Cameras** at the top left of the canvas.
5. Click **Simulate** in the **Simulate** tab to see the view move with the robot.
6. Click the view to enlarge it to 640 × 480.
7. To change the lens, right-click the view and choose **Lens**, then an angle such as **Fisheye 180°**.

**Show Simulate**, **Collapse Camera Views** and **Expand Camera Views** are in [[⌘K]], and [[⇧V]] toggles the views. Collapsed, the views stop drawing.

While a robot follows [your arms](/help/drive-a-robot-with-your-camera) or [your hand or face](/help/drive-a-case-with-your-hand-face-midi-or-voice), the computer's camera is the first tile. It's mirrored. When it follows your arms, your skeleton is drawn over it.

## Make the camera move with the robot

A camera rides with the robot when it's one of the parts a joint moves, like any other part. A camera set into a robot part by at least 2 mm, and smaller than the robot, rides with that part too. Anything else stays where it was placed when the robot moves.

The view looks out of the camera's lens, as its catalog entry marks it.

## Lenses

| Lens | Where it comes from |
|---|---|
| **Catalog Lens** | The field of view in the camera's specs; 70° when the specs give none |
| **60°**, **90°** | A normal lens with that horizontal field of view |
| **Fisheye 180°**, **Fisheye 235°** | A fisheye with that field of view, black outside the image circle |

A specs angle over 120° wide, or 140° on the diagonal, is drawn as a fisheye.

## More from the menu

- **Look Through** moves the canvas to the camera's view.
- **Rename** renames the camera part.

## Let the agent look

Type `/operate` and a task in the agent's box, such as "drive up to the box and stop". The agent drives the robot one short step at a time in the simulation. It looks at the scene view and every camera view before each next step, the way you would at the controls.

Trained policies can't see camera images. A policy can sense depth through a camera, as a grid of distances; the agent sets that up when a skill needs it.

To watch from a fixed spot in the scene instead, [add a camera view](/help/add-a-camera-view).
