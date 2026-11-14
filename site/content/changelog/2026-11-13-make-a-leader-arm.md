---
title: Make a leader arm
date: 2026-11-13
image: /changelog/make-a-leader-arm/cover.png
---

You can now make a leader arm from any arm in your scene.

Make a Leader turns the arm into a hand-sized leader with the same joints. Each joint gets a Dynamixel XL330 and printed brackets, ready for Build.

## Where it is

Make a Leader is in ⌘K whenever the scene has a fixed-base arm, and in the right-click menu of any part of that arm. The leader opens in a new tab named after the arm, so the SO-101 Arm becomes SO-101 Arm Leader.

The agent can make one too, with `make_leader`.

![Make a Leader in the right-click menu of the SO-101](/changelog/make-a-leader-arm/menu.png)

## What you get

The leader has every movable joint of the arm, in the same order, and each one turns about the same axis within the same limits. The joints sit in different places, but at any set of joint values the handle has turned exactly as the arm's gripper has, so there's no offset script to run.

Each joint is an XL330-M288 in a printed cradle, used as an angle sensor. The brackets are the robotics library's servo base and servo links, the same ones the arm template uses, sized for the XL330. A handle sits on the last joint. If the arm has a gripper, a trigger on the handle is the gripper's joint.

The leader aims for half the arm's reach. Two XL330s can't sit closer than 56 mm, so no link is shorter than that, and a small arm like the SO-101 comes out nearer 0.6×.

![Build for the leader: Checks and a bill of materials with one XL330 per joint](/changelog/make-a-leader-arm/build.png)

Build lists one XL330 per joint, the filament and the plates. The leader's scene records which scene, arm and joints it leads.

## What it doesn't do yet

Driving the arm from the leader comes next.

There are no screws on the leader yet, so Checks still flag loose parts, and some joint ranges are wider than the brackets can turn. Arms with two finger joints in their gripper, like the Franka, don't get a leader.

In the web demo the brackets stay as boxes, because the CAD kernel only runs in the desktop app.

Read [Make a leader arm](/help/make-a-leader-arm) in the help center for the steps.
