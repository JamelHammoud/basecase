---
title: Wrap a robot in a character shell
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
covers:
  - src/workspace/useWrapRobot.ts
  - src/wrap/wrapPlan.ts
  - src/wrap/wrapCore.ts
---

Turn a mesh you imported, like an owl or a droid body, into printed shells around a jointed robot, cut so every joint still moves.

1. Insert the robot (File ▸ Import Robot, or a preset from the Robots view) and import the mesh (File ▸ Import, or drop the file on the canvas).
2. Click the robot to select it, then Shift-click the mesh.
3. Press ⌘K and choose **Wrap Robot**, or right-click the selection and choose **Wrap Robot**.

![The ⌘K palette with Wrap Robot, over the SO-101 arm and an owl mesh, both selected](/help/wrap-a-robot-in-a-shell/palette.png)

A toast reads “Wrapping ⟨robot⟩…” while it works. The canvas stays live. The SO-101 takes about half a minute.

![The SO-101 and the owl, with the Wrapping SO-101 Arm toast above the toolbar](/help/wrap-a-robot-in-a-shell/wrapping.png)

When it's done, the mesh is hidden and one shell per link takes its place, selected. The SO-101 gets seven: the base, then one for each joint, named after the mesh and the joint (“owl Elbow flex”).

![Seven owl shells around the SO-101, selected](/help/wrap-a-robot-in-a-shell/shells.png)

4. Open Pose (P) and turn a joint. Each shell moves with its link.

![The arm posed, with its shells following each link](/help/wrap-a-robot-in-a-shell/posed.png)

The mesh is scaled evenly and centred on the robot until it covers the robot's box with 6 mm to spare, then hollowed to a 2 mm wall. Anywhere a servo, a link or another shell would hit across a joint's range is cut away, so a joint that turns far, like the SO-101's ±100° shoulder, leaves wide openings around it. Each shell is a printed part: it shows in the BOM and on the plates, and its weight goes into the simulation with its link. Resize a shell with Size like any other part. ⌘Z brings the mesh back and removes the shells in one step.

The agent can do the same: ask it to wrap the robot in the mesh, and it uses its `wrap_robot` tool.
