---
title: Mirror parts to the other side
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 13
keywords:
  - mirror
  - symmetry
  - symmetric
  - flip
  - left and right
  - opposite side
  - twin
  - copy
related:
  - group-parts
  - join-two-parts-with-a-hinge
covers:
  - src/mirror/plane.ts
  - src/mirror/planeFor.ts
  - src/mirror/mirrorPart.ts
  - src/mirror/mirrorDatum.ts
  - src/mirror/mirrorJoints.ts
  - src/mirror/mirrorMates.ts
  - src/mirror/mirrorAssembly.ts
  - src/workspace/useMirror.ts
  - src/workspace/mirrorCommands.tsx
  - src/components/inspector/MirrorButton.tsx
  - src/agent/agentMirror.ts
  - electron/cad-mcp/sceneTools.mjs
---

Copy an arm, a leg or a bracket to the other side of a robot, with its servos, mates and joints mirrored too.

1. Select the parts to mirror on the canvas. Shift-click adds each one after the first.
2. Right-click the selection and choose **Mirror**.
3. Choose **Side** to swap left and right, **Front** to swap front and back, or **Top** to swap top and bottom.

![The Mirror menu open on a selected left leg, with Side, Front and Top](/help/mirror-parts/menu.png)

The copies appear on the other side and stay selected. A left part's copy is named for the right, so “Left thigh” becomes “Right thigh”. A name with no side gets “(Mirror)” added. Press [[⌘Z]] to remove the copies and their joints in one step.

![The left leg and its mirrored copy on the right, selected](/help/mirror-parts/mirrored.png)

**Mirror** is also in the Inspector when several parts are selected. In [[⌘K]], **Mirror** uses the last plane you chose, or **Side** at first.

## Where the copies land

The plane runs through the middle of what you selected. For part of a robot, **Side** runs through the middle of the robot's body instead: the parts no joint moves. So a left leg lands where the right leg goes, not beside itself. Mirroring the body too puts the plane back through the selection.

## Servos, boards and screws

Real components can't be built mirror-image, so Basecase never flips them. Each copy is the same part, turned so its output shaft, holes and mounting points land where the mirrored ones would. Basic shapes are turned the same way. Parts the agent modeled, imported meshes and sculpted parts are mirrored shape and all.

## Joints and mates

A joint whose moving parts are all mirrored gets a twin on the copies, with the same range. Its hinge axis is mirrored, so the same angle on both joints moves the two sides as mirror images. A joint to an unmirrored part, such as the body, stays attached to that part. Mates move to the matching port on the other side.

## Ask the agent

The agent mirrors with the same placement through its `mirror_parts` tool, across the middle of the scene. Its copies stay linked to their source: when either side changes, the agent is reminded to mirror again. Its copies don't take joints or mates with them. To ask it, right-click a part, choose **Quote Part**, and say what to mirror and where. **Quote Part** works in the desktop app.

To sculpt both sides of one part at once, use **Mirror X** in [Sculpt a part](/help/sculpt-a-part).
