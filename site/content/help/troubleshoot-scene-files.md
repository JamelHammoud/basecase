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

If a .basecase file shows “Couldn’t open” when you try to open it, or opens somewhere you didn't expect, find the message you see below and follow its steps.

## “Not a Basecase scene”

The file isn't a scene that Basecase saved, or it changed after Basecase saved it.

1. Ask the sender to export the scene again with **Export** ▸ **Scene**.
2. Open the new file with **Open Scene File** in [[⌘K]].

Renaming a file so it ends in `.basecase` doesn't turn it into a scene. If you have an STL, OBJ or other mesh, [import it](/help/import-a-file) instead.

## “Made with a newer Basecase”

The sender's Basecase is newer than yours, and it saved something your version can't read.

1. [Update Basecase](/help/update-basecase).
2. Open the file again.

## “The scene’s parts are damaged”

At least one part in the file is missing its id, its kind or its position. Ask the sender to export the scene again.

## Double-clicking the file does nothing

Basecase doesn't open `.basecase` files from Finder or File Explorer. To open one, drop the file on the canvas, or use **Open Scene File** in [[⌘K]].

## “Up to 8 stay open”

You already have eight scenes open. Close one with [[⌘W]], then open the file again.
