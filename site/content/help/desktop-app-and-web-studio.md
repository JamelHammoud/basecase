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

Model, pose and simulate in your browser at app.basecase.so, with no download, and move to the desktop app when you need the agent.

## What the web studio does

The [web studio](https://app.basecase.so) is the same studio as the desktop app, running in a browser tab. You can place parts, import meshes and robots, pose joints, run the simulation and export files.

It saves scenes and Library models in your browser's storage, on that computer only. Clearing site data for app.basecase.so deletes them. Chats aren't saved.

## What needs the desktop app

| Feature | In the web studio |
|---|---|
| The agent | The Agent tab offers the desktop download instead |
| Slicing and printing | “Download Basecase to slice and print.” |
| SimReady objects | “Download Basecase to insert SimReady models.” |
| Training and teaching skills | Motor Kit skills only, in a browser with WebGPU |
| **Play** ▸ **Operate** | Not shown |
| STEP and IGES import | Meshes only: STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE |
| Publishing a dataset to Hugging Face | Export only |

Settings has no **Agent**, **Printers** or **Accounts** pane in the web studio. There's no menu bar either; ⌘K runs every command the menus would.

A blue strip at the top of the web studio links the desktop download. Closing it hides it for good in that browser.

## Moving a scene between them

The two don't share storage. To move a scene, [share it as a file](/help/share-a-scene) from one and [open the shared scene](/help/open-a-shared-scene) in the other.
