---
title: Give a Case its own controls
date: 2026-11-13
image: /changelog/give-a-case-its-own-controls/cover.png
---

A Case can now carry its own code, such as a joystick drawn on a canvas or a speed readout over the robot. It runs as one more panel when you run the Case.

Code panels sit in the columns beside the canvas, or float over it. An overlay pins to a corner, an edge or the whole canvas. It lets clicks through to the robot unless it asks for them.

We built it for a rover cockpit. The eight built-in panels could show the speed, but none could draw a stick to steer with.

Each panel is one HTML page of up to 256 KB, and a Case runs at most 4. A panel reads the Case's signals up to 20 times a second. It drives the robot like a gamepad does. It can send named events to the Case's logic, and press Try It or Reset when they'd work.

A panel gets the studio's greys, accent and type sizes as CSS variables. Esc and ⌘K work inside it.

The code runs in a sandboxed frame with no network, no storage and no way into the rest of the app. A panel that stops answering for 2 seconds is closed, and its first error shows in its place.

For now you add a code panel by editing the Case in its `.basecase` file.

Steps are in [Run a Case](/help/run-a-case).
