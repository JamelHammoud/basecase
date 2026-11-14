---
title: Install Basecase on a Mac or Windows PC
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: task
order: 1
popular: true
keywords:
  - download
  - setup
  - installer
  - dmg
  - exe
  - system requirements
related:
  - desktop-app-and-web-studio
  - pose-and-simulate-your-first-robot
covers:
  - src/utils/platform/webDemo.ts
  - src/landing/LandingActions.tsx
  - package.json
  - electron/backend/agentRuntimes.mjs
  - electron/main.mjs
---

You run the agent, slicing, printing and training in the Basecase desktop app. To install it, you need one of these computers:

- A Mac with Apple silicon. Basecase isn't available for Intel Macs.
- A PC running 64-bit Windows 11.

## On a Mac

1. Go to [basecase.so](https://basecase.so) and click **Download for Mac**.
2. Open `Basecase.dmg` from your downloads.
3. Drag **Basecase** into the **Applications** folder.
4. Open Basecase from **Applications**.

## On Windows

1. Go to [basecase.so](https://basecase.so) and click **Download for Windows**.
2. Open `Basecase-Setup.exe`.
3. If Windows SmartScreen stops the installer, click **More info**, then click **Run anyway**.

You don't need administrator rights to run the installer. It sets up Basecase only for your Windows account and adds a Basecase shortcut.

## The first launch

Basecase opens with a two-wheel rover in the simulator, and the agent connects while the app starts. To learn how to control the rover, see [Drive your first robot](/help/drive-your-first-robot).

The first time you open Basecase, it downloads Claude Code (263 MB). You can follow the download in the Agent tab. If you pick Codex (340 MB) or Gemini CLI (95 MB) in Settings, Basecase downloads that agent instead of Claude Code.

Basecase saves your scenes, saved models and tries in these folders:

- On a Mac: `~/Library/Application Support/Basecase`
- On Windows: `%APPDATA%\Basecase`

Camera video from a robot session can take up to 500 MB of this folder. Uninstalling Basecase on Windows leaves these files in place.

From here, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot), or [choose the agent](/help/choose-the-agent) you'll design with.
