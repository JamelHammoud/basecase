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

Turn a .basecase file someone sent you into a scene of your own, with its parts, joints and comments.

1. Press [[⌘K]].
2. Choose **Open Scene File**.
3. Pick the `.basecase` file.

The scene opens in a new tab, or in the front tab if that's a blank scene you haven't touched. It's saved to your **Scenes** menu as a new scene, so opening the same file twice makes two copies.

It's also **File** ▸ **Open Scene File**, or drop the file on the canvas. Double-clicking a `.basecase` file in Finder or File Explorer doesn't open it in Basecase.

If the file won't open, see [Scene file doesn't open](/help/troubleshoot-scene-files).
