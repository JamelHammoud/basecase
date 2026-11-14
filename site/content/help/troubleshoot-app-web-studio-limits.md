---
title: Web studio asks you to download Basecase
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 11
keywords:
  - browser
  - app.basecase.so
  - online version
  - desktop app
  - scenes missing
  - indexeddb
  - clear site data
related:
  - share-a-scene
  - open-a-shared-scene
  - troubleshoot-app-agent-not-connected
covers:
  - src/utils/platform/web/webBackend.ts
  - src/utils/platform/web/idb.ts
  - src/components/agent/DesktopDownload.tsx
  - src/app/DownloadBanner.tsx
  - src/components/SettingsWindow.tsx
  - src/workspace/meshImport.ts
---

The web studio at app.basecase.so lets you design, check and price robots in your browser. Anything that runs programs on a computer needs the desktop app.

## A message starts with “Download Basecase to”

You tried to use something only the desktop app can do. The rest of the message names it:

| Message | What needs the desktop app |
|---|---|
| “Download Basecase to use the agent.” | Claude Code, Codex and Gemini run on your computer |
| “Download Basecase to slice and print.” | Slicing, sending plates and testing printers |
| “Download Basecase to train policies.” | Training a robot to walk or do a skill |
| “Download Basecase to insert SimReady models.” | Inserting SimReady models |
| “Download Basecase to use this.” | Anything else that runs on your computer, such as importing a maker's CAD |

1. Click **Download for Mac** or **Download for Windows** in the banner above the studio, or in the **Agent** tab.
2. Install Basecase.
3. Move your scenes over. Export each one from the web studio, then open it in the desktop app.

In the web studio, the **Agent** tab reads “Build with the agent in the desktop app”. Settings doesn't have the **Agent**, **Printers** or **Accounts** panes, Checks don't have **Fix**, and you can't import STEP or IGES files.

## Your scenes are gone from the web studio

The web studio stores your scenes, Library models, prices and the parts you own in your browser, not online. Clearing the site's data deletes them, and they don't show up in another browser or on another computer.

1. Before you clear browser data, open each scene and click **Export** in the title bar.
2. Choose **Scene** to download a `.basecase` file.
3. To open the file later in the web studio or the desktop app, use **Open Scene File** in [[⌘K]].

If you clear the browser's data and a scene goes with it, you can't get that scene back.

## What works without the desktop app

Designing, Checks, the bill of materials and prices, Print mode's plate layout and 3MF export all run in your browser. Saving a scene to share works the same way in the web studio and the desktop app. For the steps, see [Share a scene](/help/share-a-scene).
