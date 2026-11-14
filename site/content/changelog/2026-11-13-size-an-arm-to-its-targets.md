---
title: Size an arm from the points it must reach
date: 2026-11-13
image: /changelog/size-an-arm-to-its-targets/cover.png
---

You can now mark the points an arm has to reach and the weight it carries, and get exact link lengths with a servo for each joint.

Select the guide shapes you placed at the targets and run Size Arm to Targets.

Say your first arm has to reach the desk, the top shelf and the bin while carrying 200 g. Until now, you had to guess the link lengths, or buy an arm that comes in one size.

## How It Sizes

Basecase searches link lengths from 75 mm up, in 5 mm steps, plus a riser under the base. It keeps the shortest arm whose tool reaches every target within 2 mm, with every joint 10% inside its range.

Each joint then gets the cheapest servo in the STS3215 outline that holds it with the payload, and the BOM prices them.

Sizing for three targets takes about 30 ms and runs in a worker. The arm lands in one undo step, with its skeleton open in the Pose tab and the margins live.

## When It Can't Reach

If a target is out of reach, Basecase places no arm, and the sheet names that target.

Basecase only places the links in the desktop app, and it doesn't check them for clearance against the table.

The agent sizes arms the same way, with its `size_arm` tool.

Read [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) in the help center for the steps.
