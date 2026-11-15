---
title: Fit a robot's body
date: 2026-11-14
image: /changelog/fit-a-robots-body/cover.png
---

You can now fit link masses, payload and floor friction from a recorded Operate run. Body fitting runs in the desktop app with emulated robots.

A weight at the end of an arm changes how it moves, even when its servo model is right. **Fit Body** replays recorded joint positions and commands in MuJoCo, the physics engine used by simulation, on top of your active servo fits. It fits the first half of the run and keeps the result only if median error on the held-out half falls by at least 25%.

A kept fit becomes a body version used by simulation and training. **Can’t tell** leaves the active model in place. You can roll back to the previous body version, and policies trained on a different model show **Out of date**. Weight and torque checks run again against the fitted body.

Real motors stay locked in the current runtime.

Follow [Fit a robot's body from a recorded run](/help/fit-a-robots-body-from-a-recorded-run).
