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

Download the desktop app, where the agent, slicing, printing and training run.

The Mac app needs a Mac with Apple silicon; there's no build for Intel Macs. The Windows app needs 64-bit Windows 11.

## On a Mac

1. Go to [basecase.so](https://basecase.so) and click **Download for Mac**.
2. Open `Basecase.dmg` from your downloads.
3. Drag **Basecase** into the **Applications** folder.
4. Open Basecase from **Applications**.

## On Windows

1. Go to [basecase.so](https://basecase.so) and click **Download for Windows**.
2. Open `Basecase-Setup.exe`.
3. If Windows SmartScreen stops the installer, click **More info**, then **Run anyway**.

The installer needs no administrator rights. It installs Basecase for your Windows account and adds a Basecase shortcut.

## The first launch

Basecase opens on a blank scene named Untitled. The agent connects as the app starts.

The first time, Basecase downloads Claude Code, a 263 MB download, and the Agent tab shows its progress. Picking Codex or Gemini CLI in Settings downloads that one instead: 340 MB and 95 MB.

Your scenes and saved models live in `~/Library/Application Support/Basecase` on a Mac and `%APPDATA%\Basecase` on Windows. Uninstalling on Windows leaves them in place.

Next, [pose and simulate your first robot](/help/pose-and-simulate-your-first-robot), or [choose the agent](/help/choose-the-agent) you'll design with.
