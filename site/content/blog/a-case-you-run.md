---
title: A Case you run
date: 2026-11-13
---

A Case in Basecase is a world and a goal a robot tries in simulation. Until now, a Case with a robot connected lived in three places. The Case and its tries sat in the Simulate tab, the emulated robot in Operate, and the camera views floated over the canvas.

Now Run Case fills the window with the Case, and the Case decides what it looks like. Its console names the inputs that drive it, the panels it shows and where they sit around the canvas. A teleop Case can show its cameras and a table of joint angles. A game can show a countdown, a score and a Reset button. A rover can show its front camera and a map with its trail.

A Case without a console runs with its cameras, brief, servos and tries.

Everything a panel shows is a named signal. Each joint has its target, position and effort. The robot has its speed and tilt, and the Case has its probes, its inputs and the contract's verdict so far. A Case can add its own timers, counters and scores. Panel kinds live in one registry, so a new kind is one entry and one view.

For now a console comes with the Case file. You write it into the `.basecase` file by hand, and New Case, the templates and the agent still make Cases without one. We wrote five consoles to test it. A rover's and a block game's parse today.

A G1 teleop, a sorting cell and a MIDI hexapod are refused until the Mac's camera, a policy and MIDI can drive a Case. Every Case file you already have still opens: format 1, unchanged.
