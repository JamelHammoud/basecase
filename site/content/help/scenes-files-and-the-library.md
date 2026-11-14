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

Basecase saves each scene while you work, so there's no Save command. To share a scene, you send it as a single .basecase file.

## Scenes save themselves

A scene is one design. It holds the parts, joints, poses, comments and goal, plus its Cases and Routines.

Basecase saves a scene 1.2 seconds after your last change. It also saves when you switch tabs, close a scene or quit.

Basecase doesn't save a blank scene until you change something, so closing an untouched one leaves nothing behind.

Undo keeps your last 50 steps in each scene.

## Where scenes live

To find a saved scene, open the **Scenes** menu in the title bar ([[⌘O]]). The menu lists scenes newest first.

You can keep up to 8 scenes open as tabs. Basecase reopens them the next time it starts.

On disk, each scene is a JSON file in `library/scenes`. You'll find that folder inside:

- `~/Library/Application Support/Basecase` on a Mac
- `%APPDATA%\Basecase` on Windows

The web studio keeps scenes in the browser instead.

## Scenes and Library models

The Library holds models, not scenes. A model is a part or a group of parts that you saved so you can drop it into any scene, such as a servo bracket, a wheel hub or a gripper.

Use a scene for a whole robot, and the Library for pieces you reuse across robots. For steps, see [Save a model to the Library](/help/save-a-model-to-the-library).

## Scene files

A `.basecase` file is a copy of one scene that you can send to someone. It holds everything the scene holds, except:

- Print history
- Trained policies
- Case tries
- Taught skills
- The build guide

Your chat with the agent also stays on your computer.

When you open a scene file, Basecase makes a new scene from it. A change on either side doesn't reach the other.

To use your design in other apps, Basecase exports STL, 3MF, USDZ and robot packages. For the full list, see [Import and export formats](/help/import-and-export-formats).
