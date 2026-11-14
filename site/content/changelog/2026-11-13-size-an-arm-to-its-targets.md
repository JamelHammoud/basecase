---
title: Size an arm from the points it must reach
date: 2026-11-13
image: /changelog/size-an-arm-to-its-targets/cover.png
---

You can now mark the points an arm must reach and the weight it carries, and get exact link lengths with a servo per joint. Links are placed in the desktop app only.

Select the guide shapes you placed at the targets and run Size Arm to Targets. A first arm usually starts from its job: reach the desk, the top shelf and the bin, carrying 200 g. Without it, someone guesses link lengths, or buys an arm that comes in one size.

Basecase searches link lengths from 75 mm in 5 mm steps, plus a riser under the base. It keeps the shortest arm whose tool reaches every target within 2 mm, with every joint 10% inside its range. Each joint then gets the cheapest servo in the STS3215 outline that holds it with the payload, and the BOM prices them. Three targets take about 30 ms, in a worker. The arm lands in one undo step, with its skeleton open in the Pose tab and the margins live.

When a target is out of reach, no arm is placed and the sheet names that target. Links aren't checked for clearance against the table. The agent sizes arms the same way with its `size_arm` tool.

Steps are in [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets).
