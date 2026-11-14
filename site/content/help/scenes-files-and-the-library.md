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

Basecase saves each scene as you work, so there's no Save command. To share a scene, send it as a single `.basecase` file.

## Scenes save themselves

A scene is one design. It includes its parts, joints, poses, comments and goal, along with its Cases and Routines.

Basecase saves your scene 1.2 seconds after your last change. It also saves when you switch tabs, close a scene or quit.

If you open a blank scene and close it without making any changes, Basecase doesn't keep it.

You can undo your last 50 steps in each scene.

## Where scenes live

To see all your saved scenes, newest first, open the **Scenes** menu in the title bar or press [[⌘O]]. You can keep up to 8 scenes open as tabs, and Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in `library/scenes`. You'll find that folder inside `~/Library/Application Support/Basecase` on a Mac, or inside `%APPDATA%\Basecase` on Windows. The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models and tries, not scenes. A model is a part or a group of parts that you saved so you can drop it into any scene, like a servo bracket, a wheel hub or a gripper.

Build a whole robot in a scene, and keep the pieces you reuse across robots in the Library. For steps, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Tries

Every try you record goes in the Library, no matter which scene you recorded it in. Each try gets its own folder in `library/tries`, next to `library/scenes`. A scene keeps a short record of each of its tries, but the recordings themselves stay in the Library. For steps, see [Open a try from any scene](/help/open-a-try-from-any-scene).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone else. It includes the whole scene except for print history, the print service and its quotes, trained policies, Case tries, taught skills and the build guide. Your chat with the agent also stays on your computer.

When you open a scene file, Basecase creates a new scene from it. The two are separate, so changes you make to one don't affect the other.

Basecase exports STL, 3MF, USDZ and robot packages, so you can use your design in other apps. For the full list, see [Import and export formats](/help/import-and-export-formats).
