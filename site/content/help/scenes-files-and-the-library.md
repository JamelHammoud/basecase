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

Basecase saves each scene as you work, so there's no Save command, and shares scenes as single .basecase files.

## Scenes save themselves

A scene is one design: its parts, joints, poses, comments and goal, plus its Cases and Routines. Basecase saves it 1.2 seconds after your last change. It also saves when you switch tabs, close a scene or quit.

A blank scene you haven't touched isn't saved. Closing it leaves nothing behind.

Undo keeps your last 50 steps in each scene.

## Where scenes live

Every saved scene is in the **Scenes** menu in the title bar ([[⌘O]]), newest first. Up to 8 scenes stay open as tabs, and Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in `library/scenes`, inside `~/Library/Application Support/Basecase` on a Mac or `%APPDATA%\Basecase` on Windows. The web studio keeps them in the browser instead.

## Scenes and Library models

The Library holds models, not scenes. A model is a part or a group of parts you saved to drop into any scene: a servo bracket, a wheel hub, a gripper.

Use a scene for a whole robot, and the Library for pieces you reuse across robots. Steps are in [Save a model to the Library](/help/save-a-model-to-the-library).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds what the scene holds, with five things left out: print history, trained policies, Case tries, taught skills and the build guide. The chat with the agent stays on your computer too.

Opening a scene file makes a new scene. Changes on either side don't reach the other.

For other apps, Basecase exports STL, 3MF, USDZ and robot packages. The full list is in [Import and export formats](/help/import-and-export-formats).
