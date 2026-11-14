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

The web studio at app.basecase.so designs, checks and prices robots in your browser, but anything that runs programs on a computer needs the desktop app.

## A message starts with “Download Basecase to”

You used something only the desktop app can do. The message names it:

| Message | What needs the desktop app |
|---|---|
| “Download Basecase to use the agent.” | Claude Code, Codex and Gemini run on your computer |
| “Download Basecase to slice and print.” | Slicing, sending plates and testing printers |
| “Download Basecase to train policies.” | Training a robot to walk or do a skill |
| “Download Basecase to insert SimReady models.” | Inserting SimReady models |
| “Download Basecase to use this.” | Anything else that runs on your computer, such as importing a maker's CAD |

1. Click **Download for Mac** or **Download for Windows** in the banner above the studio, or in the **Agent** tab.
2. Install Basecase.
3. Move your scenes over, as the next section says.

The **Agent** tab in the web studio reads “Build with the agent in the desktop app”. Settings has no **Agent**, **Printers** or **Accounts** panes, Checks have no **Fix**, and STEP and IGES files don't import.

## Your scenes are gone from the web studio

The web studio keeps scenes, Library models, prices and the parts you own in your browser, not online. Clearing the site's data deletes them. Another browser or computer doesn't see them.

1. Before you clear browser data, open each scene and click **Export** in the title bar.
2. Choose **Scene** to download a `.basecase` file.
3. Open the file later in the web studio or the desktop app with **Open Scene File** in ⌘K.

A scene deleted with the browser's data can't be brought back.

## What works without the desktop app

Designing, Checks, the bill of materials and prices, Print mode's plate layout and 3MF export all run in the browser. Saving a scene to share works the same in both; [Share a scene](/help/share-a-scene) has the steps.
