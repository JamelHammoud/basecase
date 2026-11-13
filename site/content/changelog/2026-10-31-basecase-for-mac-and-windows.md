---
title: Basecase for Mac and Windows
date: 2026-10-31
version: 0.1.0
image: /changelog/basecase-for-mac-and-windows/cover.png
---

The first release of Basecase is out for Mac and Windows 11, and it updates itself when a new version ships. The studio also runs in a browser at [app.basecase.so](https://app.basecase.so), with no download.

## What you get

Basecase is a 3D CAD studio for robots. You design in one window: Parts on the left lists real servos, motors, boards, sensors and cameras alongside ISO screws, nuts and bearings, Robots holds published robots like the SO-101 arm and the Unitree G1 that you can drop in and change, and the canvas in the middle takes trackpad orbit, pan and pinch zoom. The Agent tab on the right designs with you: describe a robot or a part and Claude, Codex or Gemini builds it in the scene, using your own login on your computer.

## Checking a design

The Build tab says whether a design is ready to build. Checks run as you work, covering parts that float free, servo torque, standing stability, fit, printability and more, and a check with a problem opens to list what it found. Under the checks sit the bill of materials with real prices, a budget, and Generate Guide, which draws step-by-step build instructions you can print.

![The Build tab with Checks, the bill of materials and Build guide](/changelog/basecase-for-mac-and-windows/build.png)

## Downloading and updating

The Mac app is for Apple silicon: download `Basecase.dmg` and drag it to Applications. On Windows 11, run `Basecase-Setup.exe`. Both links on basecase.so always point at the newest release.

The app checks for a new version when it opens and every hour after. It downloads in the background, and once it's ready a button appears at the bottom of the left rail; click it to restart into the new version. Nothing installs when you just quit. Check for Updates in the Basecase menu (Help on Windows) asks right away.

## In the browser

app.basecase.so is the same studio with the same Parts, Robots, canvas, Checks and exports, saving to your browser. The agent runs on your computer with your login, so the Agent tab there offers the download instead, and printing to your printer and driving a real robot need the desktop app too.
