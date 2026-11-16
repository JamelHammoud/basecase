---
title: Open lids and pull drawers
date: 2026-11-15
image: /changelog/open-lids-and-pull-drawers/cover.png
---

You can test an arm against a passive lid or drawer in Cases. Change the fixture's geometry, travel, weight and resistance, then record the robot moving it through contact.

Choose **Open a Lid** or **Pull a Drawer** in **New Case**. The arm must have a gripper. Click **Try Reference** to run the supplied motion through the ordinary try recorder, or **Try It** to drive the arm yourself.

To pass, the robot must maintain active handle contact while exceeding 80% of the chosen travel for 0.2 seconds. Reaching the handle isn't enough. A limp arm, a welded fixture or insufficient actuator effort will fail the Case.

The fixtures have no motors or holding torque. You keep their signed travel in saved tries, portable scenes and shared Case bundles. You can reopen recorded tries on the existing timeline.

You’re testing bounded hinges and slides in simulation. Agreement between C and WASM MuJoCo doesn’t establish physical transfer. For unsupported contacts, accelerated Forge backends keep their existing behavior: refusal or native fallback.

Steps are in [Open lids and pull drawers](/help/open-lids-and-pull-drawers).
