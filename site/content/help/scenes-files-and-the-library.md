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

Basecase saves your scenes as you work, so there's no Save command. To share a scene, send it as a single `.basecase` file.

## Scenes save themselves

Each scene is one design. It holds the design's parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves a scene 1.2 seconds after your last change. It saves again when you switch tabs, close a scene or quit. If you open a blank scene and close it without changing anything, it's discarded.

You can undo up to your last 50 steps in each scene.

## Where scenes live

To see all your saved scenes, newest first, open the **Scenes** menu in the title bar ([[⌘O]]). You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

Each scene saves to disk as a JSON file in the `library/scenes` folder, inside:

- **Mac:** `~/Library/Application Support/Basecase`
- **Windows:** `%APPDATA%\Basecase`

If you use the web studio, your scenes are kept in the browser instead.

## Scenes and Library models

The Library holds models, tries and datasets. Your scenes aren't in it. A model is a part or a group of parts you've saved to drop into any scene, such as a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse across robots in the Library. To learn how, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record goes in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, and the recordings stay in the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).

A dataset is a named set of tries from any of your scenes, kept as one file in `library/datasets`. It lists its tries without copying them, so you can delete a dataset and keep its tries. To build one, see [Make a dataset from tries](/help/make-a-dataset-from-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It carries the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

It also leaves out your chat with the agent, which stays on your computer.

When you open a scene file, Basecase makes a new scene from it. You can edit the new scene or the file without changing the other.

To use your work in other apps, you can export STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
