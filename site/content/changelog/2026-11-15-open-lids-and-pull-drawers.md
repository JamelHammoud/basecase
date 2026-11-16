---
title: Open lids and pull drawers
date: 2026-11-15
image: /changelog/open-lids-and-pull-drawers/cover.png
---

You can test an arm against a passive lid or drawer in Cases. Change the fixture's geometry, travel, weight and resistance, then record the robot moving it through contact.

An arm that reaches a handle may still lack the force to open a heavy lid. **Open a Lid** and **Pull a Drawer** in **New Case** let you test that load. The arm must have a gripper.

To pass, the robot must maintain active handle contact while exceeding 80% of the chosen travel for 0.2 seconds. Reaching the handle isn't enough. A limp arm, a welded fixture or insufficient actuator effort will fail the Case.

The fixtures have no motors or holding torque. **Try Reference** records the supplied motion, and **Try It** records your own driving. Saved tries retain signed travel and reopen on the timeline. Portable scenes and shared Case bundles retain the fixture's geometry and joints.

Changing the geometry or resistance can make the supplied reference fail. These tests run in simulation and don’t establish performance on a physical robot.

Steps are in [Open lids and pull drawers](/help/open-lids-and-pull-drawers).
