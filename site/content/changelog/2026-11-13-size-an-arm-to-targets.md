---
title: Size an arm from the points it must reach
date: 2026-11-13
image: /changelog/size-an-arm-to-targets/cover.png
---

You can now size a desk arm from the points its wrist must reach and the weight it carries. You get its link lengths and a servo for each joint.

Select up to 8 Guide parts and run Size Arm to Targets from ⌘K or the right-click menu. Enter the payload in grams, and the arm appears as one undo step.

A first arm starts from its jobs: reach the desk, the shelf and the bin, carrying 200 g. Hobby arms like the SO-101 come in one size, so the choice was guessing link lengths or asking the agent.

For those three points, it picks an 85 mm upper arm and an 85 mm forearm. Each is the shortest on a 5 mm grid that reaches every target within 2 mm. Every joint also stays at least a tenth of its range from its limits. The servos are STS3215 versions at $20 to $22 each, $82 for all four.

On the web the printed links aren't placed, only the skeleton and the servos. The agent sizes arms the same way with `size_arm`.

Steps are in [Size an arm to the points it must reach](/help/size-an-arm-to-targets).
