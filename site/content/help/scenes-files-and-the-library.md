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

Basecase saves your scenes as you work, so there's no Save command. To share a scene, send it as a single .basecase file.

## Scenes save themselves

A scene holds one design: its parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves a scene 1.2 seconds after your last change, and again when you switch tabs, close the scene or quit Basecase.

- If you open a blank scene and close it without changing anything, Basecase doesn't keep it.
- You can undo the last 50 steps in each scene.

## Where scenes live

To see your saved scenes, newest first, open the **Scenes** menu in the title bar or press [[⌘O]].

You can keep up to 8 scenes open as tabs. They reopen the next time you start Basecase.

Each scene is saved as a JSON file in `library/scenes`, inside this folder:

- **Mac:** `~/Library/Application Support/Basecase`
- **Windows:** `%APPDATA%\Basecase`

In the web studio, your browser keeps your scenes.

## Scenes and Library models

The Library holds your models and tries, but not your scenes. A model is a part or group of parts you've saved to drop into any scene, like a servo bracket, a wheel hub or a gripper.

Build each whole robot in a scene, and keep the pieces you reuse across robots in the Library. To learn how, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record is saved in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. The scene keeps a short record of each of its tries, and the recordings stay in the Library.

Tries you import from a LeRobot dataset or a ROS 2 recording go in the Library too. To bring them in, see [Import robot data as tries](/help/import-robot-data-as-tries).

You can open a try from a scene other than the one you recorded it in. See [Open a try from any scene](/help/open-a-try-from-any-scene).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent stays on your computer too.

When you open a scene file, Basecase creates a new scene from it. The new scene and the file stay separate, so a change to one doesn't affect the other.

To use your design in other apps, you can export STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
