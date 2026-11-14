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

You can turn a mesh you imported, like an owl or a droid body, into printed shells that fit around a jointed robot. Basecase cuts the shells so every joint can move.

1. Insert the robot (**File** ▸ **Import Robot**, or a preset from **Parts** ▸ **Robots**) and import the mesh (**File** ▸ **Import**, or drop the file on the canvas).
2. Click the robot to select it, then Shift-click the mesh.
3. Press [[⌘K]] and choose **Wrap Robot**. Or right-click the selection and choose **Wrap Robot**.

![The ⌘K palette with Wrap Robot, over the SO-101 arm and an owl mesh, both selected](/help/wrap-a-robot-in-a-shell/palette.png)

While Basecase wraps the robot, a toast reads “Wrapping ⟨robot⟩…” and you can keep using the canvas. Wrapping the SO-101 takes about half a minute.

![The SO-101 and the owl, with the Wrapping SO-101 Arm toast above the toolbar](/help/wrap-a-robot-in-a-shell/wrapping.png)

When it finishes, Basecase hides the mesh, puts one shell per link in its place, and selects the new shells. The SO-101 gets seven, one for the base and one for each joint. Each shell takes the name of the mesh and its joint, for example “owl Elbow flex”.

![Seven owl shells around the SO-101, selected](/help/wrap-a-robot-in-a-shell/shells.png)

4. Open Pose (P) and turn a joint. Each shell moves with its link.

![The arm posed, with its shells following each link](/help/wrap-a-robot-in-a-shell/posed.png)

To fit the shells, Basecase centers the mesh on the robot and scales it by the same amount on every axis until it covers the robot's box with 6 mm to spare. It then hollows the mesh to a 2 mm wall and cuts away any part of a shell that a servo, a link, or another shell would hit across a joint's range. A joint that turns far, like the SO-101's ±100° shoulder, leaves wide openings around it.

Each shell is a printed part. It shows in the BOM and on the plates, and Basecase adds its weight to its link in the simulation. To resize a shell, use Size, as you would with any other part.

To undo the wrap, press [[⌘Z]]. Basecase brings back the mesh and removes the shells in one step.

You can also ask the agent to wrap the robot in the mesh. It does the same thing with its `wrap_robot` tool.
