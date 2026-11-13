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

Install a new version of Basecase when it has downloaded, or check for one yourself.

Basecase checks for a new version when it starts and every hour after, and downloads it in the background. Nothing installs until you choose to restart.

## Install a downloaded update

1. Click the blue arrow above **Settings** at the bottom of the view rail. Its tooltip reads “Restart to install” and the new version.

Basecase quits, installs the update and opens again with your scenes as you left them. The blue arrow shows only once an update has downloaded.

## Check for an update

1. On a Mac, choose **Basecase** ▸ **Check for Updates**. On Windows, click **Menu**, then choose **Help** ▸ **Check for Updates**.
2. Read the dialog. It says “Basecase is up to date”, or “Downloading Basecase” and the new version.
3. When the download finishes, click the blue arrow in the view rail.

If an update can't install within a minute, Basecase shows “Couldn’t install the update”. Click **Download Basecase** to get the latest version and install it over the old one.

What's new in each version is in the [changelog](/changelog). To get versions before everyone else, [get beta updates](/help/get-beta-updates).
