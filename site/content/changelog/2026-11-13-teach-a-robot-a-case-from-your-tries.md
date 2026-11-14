---
title: Teach a robot a Case from your tries
date: 2026-11-13
image: /changelog/teach-a-robot-a-case-from-your-tries/cover.png
---

You can now teach a robot a Case by driving it yourself. Drive the robot through the Case five times, then train a policy from those tries in one click.

Basecase keeps the policy only if it passes the Case on its own.

**Train from Tries** is under Results in the Simulate tab, and in ⌘K. It only works in the desktop app.

Teaching a robot from demonstrations usually means LeRobot's Python stack, a GPU and hours of training, and nothing tells you whether the policy works until it runs on the robot.

## Trained on Your Computer

Forge learns the policy on your computer. On the arm-3dof test robot, ten 4-second tries of Touch a Point trained in under 3 seconds.

Then the policy runs the Case 32 times. Each run starts from joints up to 5° off, with random friction, masses, servo strength and delay.

## Kept Only If It Passes

At 29 passes or more, the policy becomes the Case's skill. Train lists it with Try, and the Case's row in Checks runs it instead of the scripted motion.

Below 29, nothing is saved. The start, middle and end of the worst run show you what went wrong.

## What It Reads

The policy reads joint positions, speeds and the Case's target. It doesn't read camera video, and Drive doesn't run it.

Read [Train a policy from your tries](/help/train-a-policy-from-your-tries) in the help center for the steps.
