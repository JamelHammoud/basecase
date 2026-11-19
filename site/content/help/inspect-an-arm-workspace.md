---
title: Inspect an arm workspace
date: 2026-11-18
collection: engineer
type: task
related:
  - plan-an-arm-reach
  - arena
covers:
  - src/workspace/useArmWorkspace.ts
  - src/components/pose/WorkspaceSection.tsx
  - src/skills/armWorkspace.ts
  - src/three/viewport/workspaceLayer.ts
---

Find sampled tool positions for an existing arm and test a motion to one before changing the design.

The arm must have a fixed base and powered revolute joints. You can't inspect an arm with moving obstacles, closed mechanisms or missing collision geometry.

Whole-body pose offsets must be cleared first. For each robot with an offset, select a part and choose **Rest Pose** in [[⌘K]]. Nonzero joint angles are supported.

1. On the canvas, select the arm's tool part.
2. Press [[⌘K]].
3. Choose **Inspect Workspace**.

![Sampled positions surround the selected arm, with the configuration budget in Pose](/help/inspect-an-arm-workspace/samples.png)

4. On the canvas, click a sampled dot.

![A selected dot previews the joint configuration that placed the tool point there](/help/inspect-an-arm-workspace/preview.png)

5. In **Workspace**, click **Plan Motion**.
6. In **Simulate**, under **Train**, click **Train** beside **Workspace target**.

![The planned motion appears as Workspace target in the existing Skills list](/help/inspect-an-arm-workspace/skills.png)

7. After the skill passes Arena, click **Try** to run it.

The tool point starts at the selected part's center. In Pose, edit its **X**, **Y** and **Z** coordinates in scene millimeters at rest. Use **Configurations** to change the seeded budget from its default of 2,048 to a maximum of 8,192. Use **Sample** to select a dot by number.

Each dot marks an endpoint that passed collision checks against the compiled geometry. You can't determine whether the space between dots is clear, even if the sample is empty. A dot doesn't confirm that you can reach it from the current pose. The planner may fail to find a path within its budget, and Arena may reject a planned motion.

You can inspect the workspace and select dots without changing the design. The planner must find a path before it adds an animation. Later plans get numbered names to keep earlier animations.

Changes to geometry, joints, tool selection, parked poses or the world clear the inspection. Leaving **Pose** also closes inspection and restores the current pose. Click **Close Workspace** or press [[Esc]] to close it from **Pose**.

You can't establish payload capacity, orientation reachability or physical accuracy from position samples. See [Plan an arm reach](/help/plan-an-arm-reach) for the existing planner's limits.
