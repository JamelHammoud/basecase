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

Basecase saves each scene while you work, so there's no Save command. To share a scene with someone, send it as a single `.basecase` file.

## Scenes save themselves

A scene is one design. It holds the design's parts, joints, poses, comments and goal, along with its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change. It also saves when you switch tabs, close a scene or quit.

- If you open a blank scene and close it without changing anything, Basecase doesn't keep it.
- You can undo your last 50 steps in each scene.

## Where scenes live

To see every saved scene, open the **Scenes** menu in the title bar, or press [[⌘O]]. The menu lists the newest scenes first.

You can keep up to 8 scenes open as tabs. Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in the `library/scenes` folder. You can find that folder here:

- **On a Mac:** `~/Library/Application Support/Basecase`
- **On Windows:** `%APPDATA%\Basecase`

The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models, tries and datasets, but not scenes. A model is a part or a group of parts that you saved so you can drop it into any scene, such as a servo bracket, a wheel hub or a gripper.

Build each whole robot in a scene, and keep the pieces you reuse across robots in the Library. To learn how, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Basecase files every try you record in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, but the recordings stay in the Library. To open one, see [Open a try from any scene](/help/open-a-try-from-any-scene).

A dataset is a named set of tries, and the tries can come from any of your scenes. Basecase keeps each dataset as one file in `library/datasets`. A dataset lists its tries without copying them, so you can delete a dataset and still keep its tries. To build one, see [Make a dataset from tries](/help/make-a-dataset-from-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It includes the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

It also leaves out your chat with the agent, which stays on your computer.

When you open a scene file, Basecase makes a new scene from it. Changes you make to one don't affect the other.

To work with other apps, Basecase exports STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
