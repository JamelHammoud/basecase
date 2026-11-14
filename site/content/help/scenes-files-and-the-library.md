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

Basecase saves each scene as you work, so there's no Save command. To share a scene, send it as a single `.basecase` file.

## Scenes save themselves

A scene is one design: its parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change, and again when you switch tabs, close a scene or quit. If you open a blank scene and close it without changing anything, Basecase discards it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see your saved scenes, open the **Scenes** menu in the title bar or press [[⌘O]]. The newest scene is at the top. You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

Each scene is a JSON file in `library/scenes`. On a Mac, that folder is inside `~/Library/Application Support/Basecase`. On Windows, it's inside `%APPDATA%\Basecase`. The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models and tries, not scenes. A model is a part or a group of parts you saved to drop into any scene, such as a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse across robots in the Library. To save a model, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

The Library files each try you record, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, and the recordings stay in the Library.

To open a try from another scene, see [Open a try from any scene](/help/open-a-try-from-any-scene). The Library's search finds tries from every scene. To learn how, see [Search tries](/help/search-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent also stays on your computer.

Basecase opens a scene file as a new, separate scene. Changes you make to one don't affect the other.

To use your design in other apps, export it as STL, 3MF, USDZ or a robot package. For the full list, see [Import and export formats](/help/import-and-export-formats).
