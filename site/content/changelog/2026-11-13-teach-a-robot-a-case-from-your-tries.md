---
title: Teach a robot a Case from your tries
date: 2026-11-13
image: /changelog/teach-a-robot-a-case-from-your-tries/cover.png
---

You can now drive a robot through a Case five times and train a policy from those tries in one click. Basecase keeps the policy only if it passes the Case by itself.

**Train From Tries** is under Results in the Simulate tab, and in ⌘K. It works in the desktop app only.

Teaching a robot from demonstrations usually means LeRobot's Python stack, a GPU and hours of training. Then nothing says whether the policy works until it runs on the robot.

Forge learns the policy on your computer. On the arm-3dof test robot, ten 4-second tries of Touch a Point trained in under 3 seconds. The policy then runs the Case 32 times, each from joints up to 5° off with random friction, masses, servo strength and delay.

At 29 passes or more it becomes the Case's skill. Train lists it with Try, and the Case's row in Checks runs it instead of the scripted motion. Below 29, nothing is saved, and the worst run's start, middle and end show what went wrong.

The policy reads joint positions, speeds and the Case's target, not camera video. Drive doesn't run it.

Steps are in [Train a policy from your tries](/help/train-a-policy-from-your-tries).
