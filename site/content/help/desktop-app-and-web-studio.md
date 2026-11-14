---
title: The desktop app and the web studio
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: concept
order: 2
keywords:
  - browser
  - online
  - web app
  - app.basecase.so
  - no download
related:
  - install-basecase
  - share-a-scene
covers:
  - src/utils/platform/webDemo.ts
  - src/utils/platform/web/idb.ts
  - src/utils/platform/web/webBackend.ts
  - src/app/DownloadBanner.tsx
  - src/components/agent/DesktopDownload.tsx
  - src/components/SettingsWindow.tsx
  - src/forge/tabSupport.ts
---

You can model, pose and simulate in your browser at app.basecase.so without downloading anything. When you need the agent, move to the desktop app.

## What the web studio does

The [web studio](https://app.basecase.so) is the same studio as the desktop app, running in a browser tab. You can place parts, import meshes and robots, pose joints, run the simulation and export files.

The web studio saves your scenes and Library models in your browser's storage, on that computer only. It doesn't save chats.

**Note:** If you clear site data for app.basecase.so, your browser deletes your scenes and Library models.

## What needs the desktop app

Some features work only in the desktop app. In the web studio, you see this instead:

| Feature | In the web studio |
|---|---|
| The agent | The Agent tab offers the desktop download instead |
| Slicing and printing | “Download Basecase to slice and print.” |
| SimReady objects | “Download Basecase to insert SimReady models.” |
| Training and teaching skills | “Download Basecase to train policies.”, except Motor Kit skills in a browser that can run them |
| **Play** ▸ **Operate** | Not shown |
| STEP and IGES import | Meshes only: STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE |
| Publishing a dataset to Hugging Face | Export only |
| **Place on Map** | Not shown |

In the web studio, Settings doesn't have the **Agent**, **Printers** or **Accounts** panes. There's no menu bar either. Press [[⌘K]] to run any command you'd find in the menus.

A blue strip at the top of the web studio links to the desktop download. If you close it, it won't come back in that browser.

## Moving a scene between them

The web studio and the desktop app don't share storage. To move a scene from one to the other, [share it as a file](/help/share-a-scene), then [open the shared scene](/help/open-a-shared-scene) in the other.
