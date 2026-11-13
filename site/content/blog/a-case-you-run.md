---
title: A Case you run
date: 2026-11-13
---

A Case in Basecase is a world and a goal a robot tries in simulation. Until now, running one with a robot connected meant three places at once: the Case and its tries in the Simulate tab, the emulated robot in Operate, and the camera views floating over the canvas.

Now a Case opens as a Command Center, and the Case decides what it looks like. Its console names the inputs that drive it, the panels it shows and where they sit around the canvas. A teleop Case can show its cameras and a table of joint angles; a game can show a countdown, a score and a Reset button; a rover can show its front camera and a map with its trail. A Case without a console opens with its cameras, brief, servos and tries, the way a teleop session needs them.

Everything a panel shows is a named signal: each joint's target, position and effort, the robot's speed and tilt, the Case's probes, the inputs, the contract's verdict so far, and timers, counters and scores the Case defines. Panel kinds live in one registry, so a new kind is one entry and one view.

For now a console comes with the Case file: you write it into the `.basecase` file by hand, and New Case, the templates and the agent still make Cases without one. Five consoles, a G1 teleop, a rover, a sorting cell, a block game and a MIDI hexapod, already parse and render; the ones that need the Mac's camera, a policy or MIDI are refused until those inputs exist. Every Case file you already have still opens: format 1, unchanged.
