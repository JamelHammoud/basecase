---
title: Updates don't arrive or won't install
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 10
keywords:
  - update
  - new version
  - check for updates
  - beta
  - smartscreen
  - unsigned
  - windows installer
  - updates.log
related:
  - troubleshoot-app-agent-not-connected
  - troubleshoot-app-web-studio-limits
covers:
  - electron/updates.mjs
  - electron/updateState.mjs
  - electron/app-menu.mjs
  - src/workspace/ViewRail.tsx
---

Basecase checks for updates when it opens and every hour after, and downloads them in the background before it offers to install.

## No update button appears

The button in the view rail appears only once an update has finished downloading. Until then, nothing shows.

1. On a Mac, choose **Basecase** ▸ **Check for Updates**. On Windows, choose **Help** ▸ **Check for Updates**.
2. Read the answer. “Basecase is up to date” means there's nothing newer, and “Downloading Basecase” and a version means one is on its way.
3. Wait for the arrow button to appear in the view rail. Its tooltip reads “Restart to install” and the version.
4. Click it. Basecase quits, installs the update and opens again.

Nothing installs when you quit Basecase yourself.

## “Couldn’t check for updates”

Basecase couldn't reach GitHub, where updates come from. Check you're online, then try **Check for Updates** again later.

## “Couldn’t install the update”

The update didn't install within 60 seconds of clicking the button.

1. Click **Download Basecase** in the message.
2. On a Mac, open the download and move Basecase to Applications. On Windows, run the installer.

Your scenes and Library stay where they are.

## Basecase never offers an update

A copy of Basecase run from its source code never updates itself. A Mac copy that isn't signed, such as one you packaged yourself, can't update either.

1. Download Basecase from basecase.so.
2. On a Mac, move it to Applications. On Windows, run the installer.

Updates arrive on their own from then on.

## Windows warns before the installer runs

When a Windows installer isn't signed, Microsoft Defender SmartScreen stops it with “Windows protected your PC”.

1. Click **More info**.
2. Click **Run anyway**.

## You turned off beta updates and kept the beta

**Get Beta Updates** only changes which updates you get next. Basecase never goes back to an older version, so it waits for the next stable release.

## Where the update log is

Basecase logs its update checks and downloads in `updates.log`. On a Mac it's in `~/Library/Application Support/Basecase`, and on Windows in `%APPDATA%\Basecase`.
