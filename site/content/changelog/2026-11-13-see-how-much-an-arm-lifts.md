---
title: See how much an arm lifts
date: 2026-11-13
image: /changelog/see-how-much-an-arm-lifts/cover.png
---

Checks in the Build tab now has a Payload row for any arm fixed in place: how much its hand can hold at full reach and close in, worked out from the arm as you designed it. Open the row and the canvas shows every point the hand reaches, bluer where it lifts more.

## Where it is

Open the Build tab. Payload sits in Checks with the other engineering rows, under Servo torque. It only shows for robots bolted down, like the SO-101 or an arm you built from servos; robots on legs or wheels don't get one.

![Checks for an SO-101 arm, with Payload under Servo torque](/changelog/see-how-much-an-arm-lifts/checks.png)

## What the numbers mean

Click Payload and it reads, for example, “1.26 kg at full reach, 1.88 kg close in”. Full reach is the least the hand holds once it's past 90% of the furthest it gets from the arm's first joint, measured level with the floor. Close in is the least it holds anywhere within half that distance.

Basecase samples 4,096 poses inside the joint ranges, skips the ones that put the hand under the floor, and in each pose works out the load at the hand that brings any joint to 60% of its servo's stall torque at your supply voltage. That's the most a servo holds for long. Every link's weight counts against it. A stronger shoulder servo or a higher supply voltage raises the numbers. Robots imported from a URDF or MJCF use each joint's published torque limit instead, so they're only as right as that limit: the SO-101's description gives every joint 10 N·m, about three times what its STS3215 servos stall at.

## The map

While the row is open, each sampled pose is a dot where the hand ends up: grey where it can barely hold anything, blue where it lifts the most. Collapse the row or switch to another tab and the dots go away. They never show in the captures the agent takes.

![The SO-101 inside a cloud of dots, with Payload open beside it](/changelog/see-how-much-an-arm-lifts/cover.png)

## The agent sees it too

verify_design lists the same two numbers under Payload, so the agent can size servos against the load you want to carry.

## What it doesn't do

Payload is information, never a blocker, and it doesn't change whether a design is Ready to build. It treats the load as hanging still at the hand, so it says nothing about how fast the arm can move it, and it ignores the arm hitting itself or things around it.
