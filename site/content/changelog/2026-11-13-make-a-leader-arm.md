---
title: Make a leader arm
date: 2026-11-13
image: /changelog/make-a-leader-arm/cover.png
---

Make a Leader turns an arm in your scene into a hand-sized leader with the same joints. Each joint gets a Dynamixel XL330 and printed brackets ready for Build.

## Where it is

It's in ⌘K whenever the scene has a fixed-base arm, and in the right-click menu of any part of that arm. The leader opens in a new tab named after the arm, so the SO-101 Arm becomes SO-101 Arm Leader. The agent has it too, as `make_leader`. Steps are in [Make a leader arm](/help/make-a-leader-arm).

![Make a Leader in the right-click menu of the SO-101](/changelog/make-a-leader-arm/menu.png)

## What you get

The leader has every movable joint of the arm, in the same order, turning about the same axes within the same limits. Its joint positions differ, but at any set of joint values its handle has turned exactly as the arm's gripper has. That's the property a leader needs, and it's why there's no offset script to run.

Each joint is an XL330-M288 used as an angle sensor, sitting in a printed cradle. The brackets are the robotics library's servo base and servo links, the same ones behind the arm template, sized for the XL330. The last joint carries a handle. When the arm has a gripper, a trigger on the handle is the gripper's joint.

The leader aims for half the arm's reach. No link is shorter than 56 mm, the closest two XL330s can sit, so a small arm like the SO-101 comes out nearer 0.6×.

![Build for the leader: Checks and a bill of materials with one XL330 per joint](/changelog/make-a-leader-arm/build.png)

Build lists one XL330 per joint, the filament and the plates. Its scene records which scene, arm and joints it leads.

## What it doesn't do yet

Driving the arm from the leader comes next. The leader has no screws yet, so Checks still flag loose parts, and some joint ranges are wider than the brackets can turn. Arms whose gripper has two finger joints, like the Franka, aren't offered a leader. In the web demo the brackets stay as boxes, because the CAD kernel only runs in the desktop app.
