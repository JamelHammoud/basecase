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

You can send a whole design to someone as a single `.basecase` file, and they can open it in the desktop app or in the web studio.

1. Open the scene you want to send.
2. Click **Export** at the top right of the window.
3. Choose **Scene**.
4. Send the `.basecase` file that Basecase saved. The file is named after the scene in lowercase with dashes, for example `robot-arm.basecase`.

![The Export menu with Scene highlighted](/help/share-a-scene/menu.png)

The file includes the parts, joints, poses, comments, Cases, Routines and the scene's goal.

These stay on your computer and aren't in the file:

- Print history
- Trained policies
- Case tries
- Taught skills
- The build guide
- Your chat with the agent

To learn why, see [Scenes, files and the Library](/help/scenes-files-and-the-library).

To export from the menu instead, choose **File** ▸ **Export Scene**. Or choose **Export Scene** in [[⌘K]].

To open the file, the person you send it to can follow [Open a shared scene](/help/open-a-shared-scene).
