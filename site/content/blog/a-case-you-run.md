---
title: A Case you run
date: 2026-11-13
---

Run Case now gives a Case the whole window, laid out the way you set it up inside the Case.

A Case in Basecase is a world and a goal that a robot tries in simulation. Until now, following a Case with a connected robot meant moving between three places: the Case and its tries in the Simulate tab, the emulated robot in Operate, and the camera views floating over the canvas.

## The Case Picks Its Panels

You can give a Case a console. In it you name the inputs that drive the Case, the panels it shows, and where each panel sits around the canvas.

A teleop Case can put its cameras beside a table of joint angles. A game gets a countdown, a score and a Reset button, and a rover can pair its front camera with a map of its trail.

Leave the console out and the Case runs with its cameras, brief, servos and tries.

## Every Panel Shows a Signal

Everything on a panel is a named signal. Each joint has three (target, position and effort), and the robot adds speed and tilt. The Case gives you its probes, its inputs and the contract's verdict so far, and it can define its own timers, counters and scores.

We keep panel kinds in one registry, so a new kind needs one entry and one view.

## Written by Hand, for Now

You write the console by hand into the Case's `.basecase` file. New Case, the templates and the agent make Cases without one.

We wrote five consoles to test it. Basecase parses two of them today, a rover's and a block game's. It refuses the other three (a G1 teleop, a sorting cell and a MIDI hexapod) until the Mac's camera, a policy and MIDI can drive a Case.

Your existing Case files open as before and stay on format 1, unchanged.
