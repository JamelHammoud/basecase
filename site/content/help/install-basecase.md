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

The agent, slicing, printing and training all run in the desktop app. To install it, you need one of these:

- A Mac with Apple silicon. There's no build for Intel Macs.
- A PC with 64-bit Windows 11.

## On a Mac

1. Go to [basecase.so](https://basecase.so) and click **Download for Mac**.
2. Open `Basecase.dmg` from your downloads.
3. Drag **Basecase** into the **Applications** folder.
4. Open Basecase from **Applications**.

## On Windows

1. Go to [basecase.so](https://basecase.so) and click **Download for Windows**.
2. Open `Basecase-Setup.exe`.
3. If Windows SmartScreen stops the installer, click **More info**, then click **Run anyway**.

You don't need administrator rights to run the installer. It installs Basecase for your Windows account and adds a Basecase shortcut.

## The first launch

Basecase opens with a two-wheel rover in the simulator (see [Drive your first robot](/help/drive-your-first-robot)). The agent connects while the app starts.

The first time you open Basecase, it downloads Claude Code (263 MB). You can follow its progress in the Agent tab. If you pick Codex (340 MB) or Gemini CLI (95 MB) in Settings, Basecase downloads that one instead.

Basecase keeps your scenes, saved models, tries and datasets in these folders:

- On a Mac: `~/Library/Application Support/Basecase`
- On Windows: `%APPDATA%\Basecase`

If you uninstall Basecase on Windows, these files stay where they are.

Next, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot), or [choose the agent](/help/choose-the-agent) you'll design with.
