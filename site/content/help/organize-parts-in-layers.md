---
title: Find, hide and lock parts in Layers
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 11
keywords:
  - layers
  - outliner
  - tree
  - parts list
  - hide
  - show
  - lock
  - unlock
  - rename
  - visibility
  - overall size
related:
  - group-parts
  - add-objects-to-the-scene
  - replay-a-robots-lidar-scan
covers:
  - src/components/layers/
  - src/workspace/contextMenuItems.tsx
  - src/workspace/partActions.tsx
  - src/three/viewport/picking.ts
  - src/readiness/buildChecks.ts
---

Layers shows every part in the scene as a list. You can find a part by name, and hide or lock parts so they don't get in your way while you work.

1. Click **Layers** in the view rail on the left.
2. To filter the list, type part of a name in **Search layers**.
3. Click a row to select that part on the canvas.
4. To hide the part, hover over the row and click the eye.

To lock the part instead, click the lock beside the eye.

The header shows how many parts and cutouts are in the scene, and the footer shows the **Overall size** of the visible parts.

To rename a part, double-click its row. You can also choose **Rename** from the part's right-click menu or from [[⌘K]]. Layers opens with that row's name ready to type.

To add one part to the selection or remove it, Shift-click or [[⌘]]-click its row. Right-click a row to get the same menu you see when you right-click the part on the canvas.

![The right-click menu of Servo Bracket in Layers, with Rename first](/help/organize-parts-in-layers/part-menu.png)

![The Servo Bracket row in Layers with its name field open, renamed Shoulder Bracket](/help/organize-parts-in-layers/rename.png)

## What hiding and locking do

- **Hide** removes the part from the canvas. Checks leave hidden parts out of clash, fit and assembly checks, and tell you how many parts they skipped.
- **Lock** stops the part from being clicked or dragged on the canvas, so you can work on the parts behind it. You can still select a locked part by [[⌘]]-clicking it or by clicking its row.

While a part is hidden or locked, its eye or lock stays visible on the row. You can also find **Hide** and **Lock** in the part's right-click menu and in [[⌘K]]. Once they're on, they change to **Show** and **Unlock**.

If the scene is empty, Layers is empty too. To bring in robots, objects and saved models, use **Parts** and **Library** in the same view rail.

## Sensor data rows

When a simulation with a LiDAR is loaded, the LiDAR's scan gets its own row under the robot, marked with four blue dots. Click its eye to hide the scan on the canvas. Clicking the row doesn't select anything. For steps, see [Replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
