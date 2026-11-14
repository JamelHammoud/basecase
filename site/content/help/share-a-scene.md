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

Send a whole design to someone as a single `.basecase` file. They can open it in the desktop app or in the web studio.

1. Open the scene you want to send.
2. Click **Export** in the top-right corner of the window.
3. Choose **Scene**.
4. Send the `.basecase` file. Basecase names it after the scene, in lowercase with dashes, such as `robot-arm.basecase`.

![The Export menu with Scene highlighted](/help/share-a-scene/menu.png)

You can also choose **File** ▸ **Export Scene** from the menu, or choose **Export Scene** in [[⌘K]].

The file includes the parts, joints, poses, comments, Cases, Routines and the scene's goal. It doesn't include print history, the print service and its quotes, trained policies, Case tries, taught skills, the build guide or your chat with the agent, which stay on your computer. [Scenes, files and the Library](/help/scenes-files-and-the-library) explains why.

To see how the person you send it to opens the file, read [Open a shared scene](/help/open-a-shared-scene).
