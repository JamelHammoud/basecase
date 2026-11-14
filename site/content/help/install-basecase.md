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

The agent, slicing, printing and training run in the Basecase desktop app. Download it for your Mac or Windows PC.

On a Mac, Basecase needs Apple silicon. There's no build for Intel Macs. On a PC, it needs 64-bit Windows 11.

## On a Mac

1. Go to [basecase.so](https://basecase.so) and click **Download for Mac**.
2. Open `Basecase.dmg` from your downloads.
3. Drag **Basecase** into the **Applications** folder.
4. Open Basecase from **Applications**.

## On Windows

1. Go to [basecase.so](https://basecase.so) and click **Download for Windows**.
2. Open `Basecase-Setup.exe`.
3. If Windows SmartScreen stops the installer, click **More info**, then click **Run anyway**.

The installer sets up Basecase for your Windows account and adds a Basecase shortcut. You don't need administrator rights to install it.

## The first launch

Basecase opens on a two-wheel rover in the simulator, as shown in [Drive your first robot](/help/drive-your-first-robot). The agent connects while the app starts.

The first time you open Basecase, it downloads Claude Code (263 MB). You can follow the download in the Agent tab. If you pick Codex or Gemini CLI in Settings, Basecase downloads that agent instead. Codex is 340 MB and Gemini CLI is 95 MB.

Basecase keeps your scenes and saved models in these folders:

- On a Mac: `~/Library/Application Support/Basecase`
- On Windows: `%APPDATA%\Basecase`

If you uninstall Basecase on Windows, your scenes and saved models stay in those folders.

Next, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot), or [choose the agent](/help/choose-the-agent) you'll design with.
