---
title: Replay a robot fault in the simulation
date: 2026-11-13
image: /changelog/replay-a-robot-fault-in-the-simulation/cover.png
---

You can now replay the 20 seconds before a servo fault in the simulation, as a Case the design must pass. It works on emulated arms; real motors stay locked.

When an elbow stalls on a lift, the robot daemon switches its motor off and Operate shows why. Until now the run was gone, so nobody could tell whether the servo was too weak or the simulation too kind.

Basecase now keeps the robot's last 20 seconds in memory. That's its joint readings, ten a second, and every command it took, up to 40 a second. **Replay in Sim** under the fault message turns them into a Case. It starts from the first measured pose and plays each command at its own time. The faulting joint's link is selected, and the Case runs once.

The Case passes when no joint reaches 98% of the most its servo can push. **Peak torque** in Results shows each joint against its stall torque. The Case stays in the scene, so its Checks row reruns it after every redesign.

Robots without an arm aren't offered a replay, because the leg and rover drives ignore joint commands. Steps are in [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).
