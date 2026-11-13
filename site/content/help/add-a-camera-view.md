---
title: Add a camera view
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 11
keywords:
  - stationary camera
  - fixed camera
  - static camera
  - overhead camera
  - shot
  - angle
related:
  - watch-what-the-robots-cameras-see
  - run-a-simulation
covers:
  - src/workspace/useFixedCameras.ts
  - src/cameras/fixed.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/viewCommands.tsx
  - src/components/cameras/cameraMenu.tsx
---

Save the canvas's current framing as a camera that stays put, so you watch every run from the same spot beside the canvas.

1. Move the canvas until it frames what the camera should see.
2. Right-click an empty spot on the canvas.
3. Choose **Add Camera View**.

A toast says "Added Camera 1", and the new view appears under **Cameras** at the top left of the canvas. On the canvas, the camera shows as a small frustum.

**Add Camera View** is also in [[⌘K]].

## Change a camera view

Right-click its view under **Cameras**, then choose:

- **Use Current View** to move the camera to where the canvas is looking now.
- **Lens** to give it another angle, such as **90°** or **Fisheye 180°**.
- **Rename** to name it, such as "Overhead".
- **Look Through** to move the canvas to the camera.
- **Delete** to remove it, after you confirm.

## Limits

A scene holds up to 8 camera views. They aren't parts, so they stay out of the bill of materials, the Checks and the physics. Exported datasets record the robot's camera parts and a fixed scene camera, not the camera views you add.
