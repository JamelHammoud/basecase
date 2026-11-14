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

A scene is one design. It holds your parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change, and again when you switch tabs, close a scene or quit. If you open a blank scene and close it without making a change, Basecase discards it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see all your saved scenes, newest first, open the **Scenes** menu in the title bar or press [[⌘O]]. You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

Each scene is a JSON file in `library/scenes`. On a Mac, that folder is inside `~/Library/Application Support/Basecase`. On Windows, it's inside `%APPDATA%\Basecase`. The web studio keeps scenes in the browser.

## Scenes and Library models

The Library holds models, tries and datasets. Your scenes aren't in it. A model is a part or group of parts you've saved to drop into any scene, such as a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse from robot to robot in the Library. To learn how, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record goes to the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, and the recordings themselves stay in the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).

Tries you import from a LeRobot dataset or a ROS 2 recording also go to the Library. See [Import robot data as tries](/help/import-robot-data-as-tries).

A dataset is a named set of tries, images or both. The tries can come from any of your scenes. Each dataset is a single file in `library/datasets`. It lists its tries and images without copying them, so deleting a dataset leaves the recordings and images on this computer. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

Rendered training images and their labels live in `library/frame-sets` in the desktop app, and in the browser's storage in the web studio. Their datasets appear under **Datasets** in the Library. See [Make training images from a Case](/help/make-training-images).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds the whole scene except for these:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Rendered training images and their datasets
- Taught skills
- The build guide

Your chat with the agent also stays on your computer and isn't included in the file.

When you open a scene file, Basecase creates a new scene from it. The two scenes are separate, so editing one doesn't change the other.

To move your work into other apps, Basecase exports STL, 3MF, USDZ, robot packages and DXF cut files for sheet parts. For the full list, see [Import and export formats](/help/import-and-export-formats).
