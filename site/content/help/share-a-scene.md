---
title: Share a scene
date: 2026-11-12
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 3
keywords:
  - send
  - export scene
  - basecase file
  - collaborate
  - backup
related:
  - open-a-shared-scene
  - scenes-files-and-the-library
covers:
  - src/utils/sceneFile.ts
  - src/workspace/useExportActions.ts
  - src/components/ExportMenu.tsx
  - src/workspace/exchangeCommands.tsx
---

Send a whole design to someone as one .basecase file, which they can open in the desktop app or the web studio.

1. Open the scene you want to send.
2. Click **Export** at the top right of the window.
3. Choose **Scene**.
4. Send the `.basecase` file Basecase saved. It's named after the scene, in lowercase with dashes, such as `robot-arm.basecase`.

![The Export menu with Scene highlighted](/help/share-a-scene/menu.png)

The file holds the parts, joints, poses, comments, Cases, Routines and the scene's goal. Print history, the print service and its quotes, trained policies, Case tries, taught skills and the build guide stay on your computer. So does your chat with the agent. [Scenes, files and the Library](/help/scenes-files-and-the-library) explains why.

It's also **File** ▸ **Export Scene**, and **Export Scene** in [[⌘K]]. The person you send it to follows [Open a shared scene](/help/open-a-shared-scene).
