---
title: Basecase for Mac and Windows
date: 2026-10-31
version: 0.1.0
image: /changelog/basecase-for-mac-and-windows/cover.png
---

Basecase 0.1.0 is out for Apple silicon Macs and 64-bit Windows 11. You design a robot in 3D, and an agent works in the same scene with you.

## What you get

Basecase is a 3D CAD studio for robots. You design in one window. Parts on the left lists real servos, motors, boards, sensors and cameras alongside ISO screws, nuts and bearings. Robots holds published robots like the SO-101 arm and the Unitree G1, ready to drop in and change. The canvas in the middle takes trackpad orbit, pan and pinch zoom.

The Agent tab on the right designs with you. Describe a robot or a part and Claude Code, Codex or Gemini CLI builds it in the scene, signed in with your own account. Basecase downloads the one you pick the first time you use it. Offline, the built-in outline tracer, needs no account.

## Checking a design

The Build tab says whether a design is ready to build. Checks run as you work, covering parts that float free, servo torque, standing stability, fit, printability and more. A check with a problem opens to list what it found. Under the checks sit the bill of materials with real prices, a budget, and Generate Guide, which draws step-by-step build instructions you can print.

![The Build tab with Checks, the bill of materials and Build guide](/changelog/basecase-for-mac-and-windows/build.png)

## Downloading and updating

The Mac app is for Apple silicon: download `Basecase.dmg` and drag it to Applications. It isn't built for Intel Macs. On Windows 11, run `Basecase-Setup.exe`. Both links on basecase.so always point at the newest release.

The app checks for a new version when it opens and every hour after. It downloads in the background. Once it's ready a button appears at the bottom of the left rail; click it to restart into the new version. Nothing installs until you click it, not even when you quit. Check for Updates in the Basecase menu (Help on Windows) asks right away.

## In the browser

[app.basecase.so](https://app.basecase.so) is the same studio with the same Parts, Robots, canvas, Checks and exports, with no download, saving scenes in your browser. The agent runs on your computer with your login, so the Agent tab there offers the download instead. Printing, SimReady models, training and driving a real robot need the desktop app too.

To pick an agent, follow [Choose the agent](/help/choose-the-agent).
