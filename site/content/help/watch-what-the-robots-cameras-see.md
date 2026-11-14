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

You can put a camera part on your robot and watch its live view beside the canvas while the simulation runs. The view is drawn through the camera's real lens.

1. Click **Parts** in the view rail.
2. Open **Cameras**, or **Depth Cameras** for a depth sensor.
3. Drag the camera onto the robot, facing where it should look.
4. Find its live view under **Cameras** at the top left of the canvas.
5. Click **Simulate** in the **Simulate** tab to see the view move with the robot.
6. Click the view to enlarge it to 640 × 480.
7. To change the lens, right-click the view and choose **Lens**, then choose an angle such as **Fisheye 180°**.

You can also find **Show Simulate**, **Collapse Camera Views** and **Expand Camera Views** in [[⌘K]]. To show or hide the views, press [[⇧V]]. Collapsed views stop drawing.

When a robot follows [your arms](/help/drive-a-robot-with-your-camera) or [your hand or face](/help/drive-a-case-with-your-hand-face-midi-or-voice), your computer's camera is the first tile, mirrored. If the robot follows your arms, your skeleton is drawn over the image.

## Make the camera move with the robot

A camera moves with the robot when it's one of the parts a joint moves. It also moves with a robot part if it's set into that part by at least 2 mm and is smaller than the robot. Any other camera stays where it was placed when the robot moves.

The view looks out of the camera's lens, as marked in its catalog entry.

## Lenses

| Lens | Where it comes from |
|---|---|
| **Catalog Lens** | The field of view in the camera's specs, or 70° if the specs don't give one |
| **60°**, **90°** | A normal lens with that horizontal field of view |
| **Fisheye 180°**, **Fisheye 235°** | A fisheye with that field of view, black outside the image circle |

If the angle in the specs is over 120° wide, or over 140° on the diagonal, the view is drawn as a fisheye.

## More from the menu

The right-click menu on a camera view also has these options:

- **Look Through** moves the canvas to the camera's view.
- **Rename** renames the camera part.

## Let the agent look

In the agent's box, type `/operate` followed by a task, such as "drive up to the box and stop." The agent drives the robot in the simulation, one short step at a time. Before each step, it looks at the scene view and every camera view, the same way you would at the controls.

Trained policies can't see camera images, but they can sense depth through a camera as a grid of distances. The agent sets this up when a skill needs it.

To watch from a fixed spot in the scene instead, [add a camera view](/help/add-a-camera-view).
