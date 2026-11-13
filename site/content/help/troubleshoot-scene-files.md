---
title: Scene file doesn't open
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
keywords:
  - can't open
  - basecase file
  - error
  - damaged
  - newer version
  - not a basecase scene
  - file won't open
related:
  - open-a-shared-scene
  - share-a-scene
covers:
  - src/utils/sceneFile.ts
  - src/app/useSceneLibrary.ts
  - src/app/tabModel.ts
---

Fixes for a .basecase file that shows “Couldn’t open” when you try to open it, or opens somewhere you didn't expect.

## “Not a Basecase scene”

The file isn't a scene Basecase saved, or it was changed after it was saved.

1. Ask the sender to export the scene again with **Export** ▸ **Basecase Scene**.
2. Open the new file with **Open Scene File** in ⌘K.

A file renamed to end in `.basecase` doesn't become a scene. For STL, OBJ and other meshes, [import a mesh](/help/import-a-mesh) instead.

## “Made with a newer Basecase”

The sender's Basecase is newer than yours, and saved something yours can't read.

1. [Update Basecase](/help/update-basecase).
2. Open the file again.

## “The scene’s parts are damaged”

At least one part in the file is missing its id, its kind or its position. Ask the sender to export the scene again.

## Double-clicking the file does nothing

Basecase doesn't open `.basecase` files from Finder or File Explorer. Drop the file on the canvas, or use **Open Scene File** in ⌘K.

## “Up to 8 stay open”

Eight scenes are already open. Close one with [[⌘W]], then open the file again.
