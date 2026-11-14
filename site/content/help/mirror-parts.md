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

You can copy an arm, a leg or a bracket to the other side of a robot, along with its servos, mates and joints.

1. On the canvas, select the parts you want to mirror. To add more parts after the first, Shift-click each one.
2. Right-click the selection, then choose **Mirror**.
3. Choose the plane to mirror across:
   - **Side** swaps left and right.
   - **Front** swaps front and back.
   - **Top** swaps top and bottom.

![The Mirror menu open on a selected left leg, with Side, Front and Top](/help/mirror-parts/menu.png)

The copies appear on the other side and stay selected. A left part's copy is named for the right, so “Left thigh” becomes “Right thigh.” If a name doesn't include a side, Basecase adds “(Mirror)” to it. To remove the copies and their joints in one step, press [[⌘Z]].

![The left leg and its mirrored copy on the right, selected](/help/mirror-parts/mirrored.png)

You can also find **Mirror** in the Inspector when several parts are selected. In [[⌘K]], **Mirror** uses the last plane you chose, or **Side** if you haven't chosen one.

## Where the copies land

The plane runs through the middle of your selection. When you select part of a robot, **Side** runs through the middle of the robot's body instead (the parts that no joint moves), so a left leg's copy lands where the right leg goes. If you mirror the body too, the plane goes back to the middle of your selection.

## Servos, boards and screws

Real components can't be built as mirror images, so Basecase doesn't flip them. Each copy is the same part, turned so its output shaft, holes and mounting points land where the mirrored ones would. Basecase turns basic shapes the same way.

Parts the agent modeled, imported meshes and sculpted parts are fully mirrored, shape included.

## Joints and mates

If all of a joint's moving parts are mirrored, the copies get a twin of that joint with the same range. The twin's hinge axis is mirrored, so setting both joints to the same angle moves the two sides as mirror images.

A joint to a part you didn't mirror, such as the body, stays attached to that part. Mates move to the matching port on the other side.

## Ask the agent

The agent mirrors parts with its `mirror_parts` tool, using the same placement across the middle of the scene. Its copies stay linked to their source. When either side changes, the agent gets a reminder to mirror again. The agent's copies don't take joints or mates with them.

To ask the agent to mirror something, right-click a part, choose **Quote Part**, then say what to mirror and where.

**Note:** **Quote Part** works in the desktop app.

To sculpt both sides of one part at once, use **Mirror X** in [Sculpt a part](/help/sculpt-a-part).
