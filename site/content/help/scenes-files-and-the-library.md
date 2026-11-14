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
---

Basecase saves your scenes while you work, so there's no Save command. To share a scene with someone, send it as a single `.basecase` file.

## Scenes save themselves

A scene is one design: its parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves a scene 1.2 seconds after your last change, and again when you switch tabs, close a scene or quit. If you open a blank scene and close it without making a change, Basecase discards it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see all your saved scenes, newest first, open the **Scenes** menu in the title bar or press [[⌘O]]. You can keep up to 8 scenes open as tabs, and they reopen the next time Basecase starts.

Each scene is saved as a JSON file in the `library/scenes` folder. On a Mac, that folder is inside `~/Library/Application Support/Basecase`. On Windows, it's inside `%APPDATA%\Basecase`. In the web studio, your browser keeps your scenes.

## Scenes and Library models

The Library is separate from your scenes. It holds models and tries. A model is a part or group of parts you've saved to drop into any scene, for example a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse from robot to robot in the Library. See [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record goes in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, but the recordings stay in the Library. See [Open a try from any scene](/help/open-a-try-from-any-scene).

You can search the Library for tries from every scene. See [Search tries](/help/search-tries).

Tries you import from a LeRobot dataset or a ROS 2 recording also go in the Library. See [Import robot data as tries](/help/import-robot-data-as-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It includes the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent isn't in the file. It stays on your computer.

When you open a scene file, Basecase creates a new scene from it. The two scenes are separate, so changes you make to one don't affect the other.

To use your work in other apps, you can export STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
