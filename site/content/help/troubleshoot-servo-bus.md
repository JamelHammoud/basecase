---
title: Servo bus is red
date: 2026-11-14
collection: troubleshooting
type: troubleshooting
covers:
  - src/wiring/wiringChecks.ts
hub_troubleshoot_build_check_blocks_ready_to_build_order: 40
hub_troubleshoot_build_check_blocks_ready_to_build: |
  ## Servo bus is red

  Your build has at least one bus adapter, but none of them takes these servos' connector. For example, you'll see this if you use DYNAMIXEL X servos with a Waveshare Bus Servo Adapter (A).

  1. Open **Servo bus** in Checks. It names the adapter you need to add, for example **Add a JST EH 3-pin bus adapter for 2 servos.**
  2. Open **Parts** and place that adapter in the robot. For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**. For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

  You're done when **Servo bus** no longer appears in the list.
---

Your build has at least one bus adapter, but none of them takes these servos' connector.

## The adapter has a different connector

For example, you'll see this if you use DYNAMIXEL X servos with a Waveshare Bus Servo Adapter (A).

1. In **Checks**, open **Servo bus**. It names the adapter you need to add, for example **Add a JST EH 3-pin bus adapter for 2 servos.**
2. In **Parts**, add an adapter with that connector.

For JST EH 3-pin, use the **ROBOTIS U2D2** or **ROBOTIS OpenRB-150**. For 5264 3-pin, use the **Waveshare Bus Servo Adapter (A)**.

You're done when **Servo bus** no longer appears in the list.
