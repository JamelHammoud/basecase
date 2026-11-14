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

Basecase saves your scene while you work, so there's no Save command. When you want to share a scene with someone, you send it as a single .basecase file.

## Scenes save themselves

A scene is one design. It holds your parts, joints, poses, comments and goal, along with the scene's Cases and Routines.

Basecase saves a scene 1.2 seconds after your last change. It also saves when you switch tabs, close a scene or quit. If you open a blank scene and close it without making any changes, Basecase doesn't keep it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see all of your saved scenes, open the **Scenes** menu in the title bar or press [[⌘O]]. Your newest scenes appear at the top. You can have up to 8 scenes open as tabs at once, and Basecase reopens them the next time it starts.

Each scene is saved as a JSON file in `library/scenes`. On a Mac, you'll find that folder inside `~/Library/Application Support/Basecase`. On Windows, it's inside `%APPDATA%\Basecase`. The web studio keeps your scenes in the browser instead of in this folder.

## Scenes and Library models

The Library holds models and tries, not scenes. A model is a part or a group of parts that you saved so you can add it to any scene, like a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene. Use the Library for the pieces you want to reuse across robots. To add a piece to the Library, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record goes in the Library, no matter which scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. The scene keeps a short record of each of its tries, but the recordings stay in the Library. To open a try while you're in a different scene, see [Open a try from any scene](/help/open-a-try-from-any-scene).

To find a try, use the Library's search. You can search tries by words, facts and motion. Learn more in [Search tries](/help/search-tries).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone else. It includes the whole scene except for:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent isn't included either. It stays on your computer.

When you open a scene file, Basecase creates a new scene from it. The two scenes are separate, so changes you make in one don't appear in the other.

To use your design in other apps, you can export STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
