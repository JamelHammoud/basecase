---
title: Update Basecase
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: task
order: 4
keywords:
  - new version
  - upgrade
  - check for updates
  - latest version
  - release notes
related:
  - get-beta-updates
  - install-basecase
covers:
  - electron/updates.mjs
  - electron/updateState.mjs
  - electron/app-menu.mjs
  - src/workspace/ViewRail.tsx
---

You can install a new version of Basecase once it has downloaded, or check for one yourself.

Basecase checks for a new version when it starts and every hour after that. If it finds one, it downloads it in the background and waits for you to restart before installing it.

## Install a downloaded update

The blue arrow appears in the view rail only after an update has downloaded.

1. At the bottom of the view rail, click the blue arrow above **Settings**. Its tooltip reads “Restart to install” and the new version.

Basecase quits, installs the update, then opens again with your scenes as you left them.

## Check for an update

1. On a Mac, choose **Basecase** ▸ **Check for Updates**. On Windows, click **Menu**, then choose **Help** ▸ **Check for Updates**.
2. A dialog appears. It says “Basecase is up to date”, or “Downloading Basecase” and the new version.
3. When the download finishes, click the blue arrow in the view rail.

If an update can't install within a minute, Basecase shows “Couldn’t install the update”. Click **Download Basecase** to get the latest version, then install it over the old one.

To see what's new in each version, read the [changelog](/changelog). To get new versions before everyone else, [get beta updates](/help/get-beta-updates).
