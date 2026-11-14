---
title: See how much an arm lifts
date: 2026-11-13
image: /changelog/see-how-much-an-arm-lifts/cover.png
---

Checks in the Build tab now has a Payload row for any arm that's fixed in place. It tells you how much the hand can hold at full reach and close in, worked out from the arm you designed.

Open the row, and the canvas shows every point the hand reaches, bluer where it lifts more.

## Where it is

Open the Build tab. Payload is in Checks with the other engineering rows, under Servo torque.

It only shows up for robots that are bolted down, like the SO-101 or an arm you built from servos. Robots on legs or wheels don't get one.

The steps are in [Get a robot ready to build](/help/get-a-robot-ready-to-build).

![Checks for an SO-101 arm, with Payload under Servo torque](/changelog/see-how-much-an-arm-lifts/checks.png)

## What the numbers mean

Click Payload and it reads something like “1.26 kg at full reach, 1.88 kg close in”.

Full reach is the least the hand holds once it's past 90% of the furthest it gets from the first joint, measured level with the floor. Close in is the least it holds anywhere within half that distance.

Basecase samples 4,096 poses inside the joint ranges and skips the ones that put the hand under the floor. In each pose, it finds the load at the hand that brings any joint to 60% of its servo's stall torque at your supply voltage, which is the most a servo can hold for long.

Every link's weight counts against it. A stronger shoulder servo or a higher supply voltage raises the numbers.

Robots imported from a URDF or MJCF use each joint's published torque limit instead, so their numbers are only as accurate as that limit. The SO-101's description, for example, gives every joint 10 N·m, about three times what its STS3215 servos stall at.

## The map

While the row is open, each sampled pose shows up as a dot where the hand ends up. Dots are gray where the hand can barely hold anything and blue where it lifts the most.

Collapse the row or switch to another tab and the dots go away. The captures the agent takes never include them.

![The SO-101 inside a cloud of dots, with Payload open beside it](/changelog/see-how-much-an-arm-lifts/cover.png)

## The agent sees it too

`verify_design` lists the same two numbers under Payload, so the agent can size servos against the load you want to carry.

## What it doesn't do

Payload is for information only and never changes whether a design is Ready to build.

It treats the load as hanging still at the hand, so it says nothing about how fast the arm can move it. It also ignores the arm hitting itself or things around it.
