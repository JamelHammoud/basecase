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

Basecase checks for updates when it opens, and then every hour. It downloads each update in the background and offers to install it only after the download is done.

## No update button appears

The update button in the view rail appears only after an update has finished downloading. To check for an update right away:

1. On a Mac, choose **Basecase** ▸ **Check for Updates**. On Windows, choose **Help** ▸ **Check for Updates**.
2. Read the message that appears. “Basecase is up to date” means there's no newer version. “Downloading Basecase” with a version number means an update is on its way.
3. Wait for the arrow button to appear in the view rail. Its tooltip shows “Restart to install” and the version.
4. Click the button. Basecase quits, installs the update and opens again.

**Note:** Quitting Basecase yourself doesn't install a downloaded update.

## “Couldn’t check for updates”

Basecase couldn't reach GitHub, where it gets its updates. Make sure you're online, then wait a minute and choose **Check for Updates** again.

## “Couldn’t install the update”

The update didn't install within 60 seconds of clicking the update button. To install it yourself:

1. Click **Download Basecase** in the message.
2. On a Mac, open the download and move Basecase to Applications. On Windows, run the installer.

Your scenes and Library stay where they are.

## Basecase never offers an update

Some copies of Basecase can't update themselves:

- A copy run from its source code.
- A Mac copy that isn't signed, such as one you packaged yourself.

To start getting updates:

1. Download Basecase from basecase.so.
2. On a Mac, move it to Applications. On Windows, run the installer.

From then on, updates arrive on their own.

## Windows warns before the installer runs

If a Windows installer isn't signed, Microsoft Defender SmartScreen stops it and shows “Windows protected your PC”. To run it anyway:

1. Click **More info**.
2. Click **Run anyway**.

## You turned off beta updates and kept the beta

Turning off **Get Beta Updates** only changes which updates you get next. Basecase never goes back to an older version, so it stays on the beta until the next stable release.

## Where the update log is

Basecase records its update checks and downloads in a file called `updates.log`, in this folder:

- On a Mac: `~/Library/Application Support/Basecase`
- On Windows: `%APPDATA%\Basecase`
