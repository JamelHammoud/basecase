---
title: Scenes, files and the Library
date: 2026-11-13
updated: 2026-11-13
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

Basecase saves each scene while you work, so there's no Save command. To share a scene with someone, send it as a single .basecase file.

## Scenes save themselves

A scene is one design. It includes its parts, joints, poses, comments, and goal, along with its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change. It also saves when you:

- Switch tabs
- Close a scene
- Quit Basecase

If you open a blank scene and close it without changing anything, Basecase doesn't keep it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see all your saved scenes, open the **Scenes** menu in the title bar or press [[⌘O]]. The newest scenes appear first.

You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in the `library/scenes` folder. You can find that folder here:

- **On Mac:** inside `~/Library/Application Support/Basecase`
- **On Windows:** inside `%APPDATA%\Basecase`

The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models and tries. You find your scenes in the **Scenes** menu. A model is a part or a group of parts that you saved so you can drop it into any scene, like a servo bracket, a wheel hub, or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse across robots in the Library. To learn how, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Basecase files every try you record in the Library, whichever scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`.

A scene keeps a short record of each of its tries, but the recordings stay in the Library. For more information, see [Open a try from any scene](/help/open-a-try-from-any-scene).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It includes the whole scene except:

- Print history
- The print service and its quotes
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent also stays on your computer.

When you open a scene file, Basecase creates a new scene from it. The file and the new scene are separate, so changes you make to one don't affect the other.

To use your design in other apps, export it as STL, 3MF, USDZ, or a robot package. For the full list, see [Import and export formats](/help/import-and-export-formats).
