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

A camera view saves what the canvas currently shows as a camera that doesn't move. Use one to watch every run from the same spot, in a view beside the canvas.

1. Move the canvas until it frames what you want the camera to see.
2. Right-click an empty spot on the canvas.
3. Choose **Add Camera View**.

The new view, Camera 1, appears under **Cameras** at the top left of the canvas. The camera also shows on the canvas as a small frustum.

You can also find **Add Camera View** in [[⌘K]].

## Change a camera view

Right-click the view under **Cameras**, then choose one of these:

- **Use Current View** moves the camera to where the canvas is looking now.
- **Lens** gives it another angle, such as **90°** or **Fisheye 180°**.
- **Rename** lets you give it a name, like "Overhead".
- **Look Through** moves the canvas to the camera.
- **Delete** removes it after you confirm.

## Limits

A scene can hold up to 8 camera views. Camera views aren't parts, so the bill of materials, the Checks and the physics don't include them.

Exported datasets record the robot's camera parts and a fixed scene camera. They don't record the camera views you add.
