---
title: Inspect an arm's workspace
date: 2026-11-18
image: /changelog/inspect-an-arm-workspace/cover.png
---

You can inspect sampled tool positions for a fixed-base arm before changing its design. Select the tool and choose Inspect Workspace from the command palette or selection menu.

An arm can look long enough to reach a bin, but joint limits or a parked gripper can rule out useful configurations. In the workspace view, you sample the existing arm with those limits and branches in place.

In Pose, you start with 2,048 seeded configurations and can use budgets up to 8,192. Each dot retains a joint configuration that passed collision checks. Select a dot to preview the arm without changing scene data. Use Plan Motion to search from the current pose to that configuration. If the planner finds a path, you get a plan in Skills named Workspace target.

The dots show sampled endpoints checked against the compiled collision geometry. You don't know whether the arm can reach positions between them. A configuration can pass static clearance checks without a path to reach it, and the existing planner can refuse to plan one. Arena decides whether to retain a trained skill. You can't establish payload capacity, orientation reachability or physical accuracy from these samples.

Steps are in [Inspect an arm workspace](/help/inspect-an-arm-workspace).
