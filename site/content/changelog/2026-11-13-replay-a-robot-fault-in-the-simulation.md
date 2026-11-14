---
title: Replay a robot fault in the simulation
date: 2026-11-13
image: /changelog/replay-a-robot-fault-in-the-simulation/cover.png
---

You can now replay the 20 seconds before a servo fault in the simulation, as a Case your design has to pass.

When an elbow stalls on a lift, the robot daemon switches its motor off and Operate shows why. Until now, the run was gone after that, so you couldn't tell whether the servo was too weak or the simulation too kind.

Basecase now keeps the robot's last 20 seconds in memory: its joint readings, ten a second, and every command it took, up to 40 a second.

Click **Replay in Sim** under the fault message to turn those 20 seconds into a Case. The Case starts from the first measured pose and plays each command at its own time. Basecase selects the link of the joint that faulted and runs the Case once.

## When It Passes

The Case passes when no joint reaches 98% of the most torque its servo can produce. **Peak torque** in Results shows each joint against its stall torque.

The Case stays in the scene, and its Checks row reruns it after every redesign.

## What Replays

Replay works on emulated arms. Real motors stay locked.

Robots without an arm don't get a replay, because the leg and rover drives ignore joint commands.

Read [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation) in the help center for the steps.
