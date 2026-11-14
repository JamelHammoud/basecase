---
title: Scenes, files and the Library
date: 2026-11-13
updated: 2026-11-14
collection: files-and-sharing
type: concept
order: 1
keywords:
  - save
  - autosave
  - where are my files
  - project
  - document
  - storage
  - basecase file
related:
  - reopen-a-saved-scene
  - share-a-scene
covers:
  - src/workspace/useAutosave.ts
  - src/workspace/sceneDraft.ts
  - src/utils/sceneFile.ts
  - src/app/openScenes.ts
  - src/components/ScenesMenu.tsx
  - src/components/LibraryPanel.tsx
  - electron/backend/libraryPaths.mjs
  - electron/library/datasetStore.mjs
---

Basecase saves each scene as you work, so there's no Save command. To share a scene, send it as a single .basecase file.

## Scenes save themselves

A scene is one design. It holds its parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change, and again when you switch tabs, close a scene or quit. If you open a blank scene and close it without changing anything, Basecase doesn't keep it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see every saved scene, open the **Scenes** menu in the title bar ([[⌘O]]). Basecase lists them newest first. You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in `library/scenes`. You'll find that folder here:

- **Mac:** `~/Library/Application Support/Basecase`
- **Windows:** `%APPDATA%\Basecase`

The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models, tries and datasets, but not scenes. A model is a part or a group of parts you saved so you can drop it into any scene, such as a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse across robots in the Library. For steps, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Basecase files every try you record in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, but the recordings stay in the Library. For steps, see [Open a try from any scene](/help/open-a-try-from-any-scene).

A dataset is a named set of tries from any scenes, kept as one file in `library/datasets`. A dataset lists its tries instead of copying them, so deleting a dataset leaves its tries alone. For steps, see [Make a dataset from tries](/help/make-a-dataset-from-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds the whole scene except for:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent also stays on your computer.

Opening a scene file makes a new scene from it. Changes you make to either one don't affect the other.

For other apps, Basecase exports STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
