---
title: Servo bus or Cable reach is red
date: 2026-11-14
collection: troubleshooting
type: troubleshooting
covers:
  - src/wiring/wiringChecks.ts
  - src/wiring/routeAnalysis.ts
  - src/wiring/cableStock.ts
  - src/wiring/routeMotion.ts
  - src/wiring/routeBound.ts
  - src/wiring/routeMeasure.ts
hub_troubleshoot_build_check_blocks_ready_to_build_order: 40
hub_troubleshoot_build_check_blocks_ready_to_build: |
  ## Servo bus is red

  Your build has at least one bus adapter, but none of them takes these servos' connector. For example, you'll see this if you use DYNAMIXEL X servos with a Waveshare Bus Servo Adapter (A).

  1. Open **Servo bus** in Checks. It names the adapter you need to add, for example **Add a JST EH 3-pin bus adapter for 2 servos.**
  2. Open **Parts** and place that adapter in the robot. For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**. For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

  You're done when **Servo bus** no longer appears in the list.

  ## Cable reach is red

  In **Checks**, open **Cable reach** to see the cable's endpoints, required length and the joint position that needs it. A route that is blocked, too short or unresolved keeps the build from passing.

  [Servo bus or Cable reach is red](/help/troubleshoot-servo-bus) explains the cable stock and routing limits.
---

Find the adapter mismatch or cable route that keeps your build from passing Checks.

## The adapter has a different connector

For example, you'll see this if you use DYNAMIXEL X servos with a Waveshare Bus Servo Adapter (A).

1. In **Checks**, open **Servo bus**. It names the adapter you need to add, for example **Add a JST EH 3-pin bus adapter for 2 servos.**
2. In **Parts**, add an adapter with that connector.

For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**. For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

You're done when **Servo bus** no longer appears in the list.

## Cable reach is red

1. In **Build**, open **Cable reach** under **Checks**.
2. Read the affected cable's endpoints, required length and available cable length. When a joint position limits the route, its angle or travel is listed too.
3. Click a part name in the finding to select that endpoint in the scene.
4. Move the parts to shorten the route or clear the connector's exit, then check **Cable reach** again.

![Cable reach expanded with a route needing more than the available 180 mm cable](/help/troubleshoot-servo-bus/cable-reach.png)

The check measures servo bus connections and power connections with two scene endpoints through the declared joint ranges. It allows for connector exits, bends and slack. A missing port position, unbounded joint range, blocked route or unknown cable length stays a blocker.

Virtual fuse, switch and supply connections stay on the wiring list but are excluded from **Cable reach**. They have no physical placement to measure.

Routes go around boxes enclosing the parts, so a hole or narrow passage can still appear blocked. A route that changes sides around a solid, coupled linkages and joint ranges that exceed the routing calculation's limit remain unresolved.

## Cable length is unknown

Matching connectors alone can’t pass the reach check. The cable must have a recorded length and source. The catalog includes the 180 mm **ROBOTIS Robot Cable-X3P** and Waveshare 5264 servo cables in 300 mm and 900 mm lengths. Measured power connections without compatible cable stock remain unresolved.

When a known cable is too short, the bill of materials keeps that cable and **Cable reach** stays red. Adding a longer cable as a purchase extra doesn’t give it connector or length data for this check.

After checking the routes, [Build a robot step by step on the canvas](/help/build-along) shows each cable when both endpoints have been installed.
