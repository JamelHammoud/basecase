---
title: Open a shared scene
date: 2026-11-12
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 4
keywords:
  - open file
  - import scene
  - basecase file
  - received
related:
  - share-a-scene
  - troubleshoot-scene-files
covers:
  - src/utils/sceneFile.ts
  - src/app/useSceneLibrary.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/exchangeCommands.tsx
---

You can open a `.basecase` file someone sent you as a scene of your own. The scene keeps its parts, joints and comments.

1. Press [[⌘K]].
2. Choose **Open Scene File**.
3. Select the `.basecase` file.

The scene opens in a new tab. If the front tab is a blank scene you haven't touched, the scene opens there instead. Basecase saves it to your **Scenes** menu as a new scene, so opening the same file twice gives you two copies.

You can also choose **File** ▸ **Open Scene File**, or drop the file on the canvas. Double-clicking a `.basecase` file in Finder or File Explorer doesn't open it in Basecase.

If the file won't open, see [Scene file doesn't open](/help/troubleshoot-scene-files).
