---
title: Share scenes as files
date: 2026-11-01
version: 0.1.1
image: /changelog/share-scenes-as-files/cover.png
---

You can now send someone a whole scene as one `.basecase` file, and they can open it in their own Basecase.

Until now, you could take a design out of the app as an image, an STL, 3MF plates or a USDZ model. Those files hold the shapes, with no joints and no comments.

## Sending a scene

Click Export at the top right and choose Scene, or run Export Scene from ⌘K or the File menu. Basecase saves the file to your downloads under the scene's name.

Every part goes into the file with its size, color and position, imported meshes included. So do the joints between parts, the comments you've pinned in 3D and the scene's goal.

Your work around the design stays on your machine: the chat, print history, trained policies, Case tries, skills and the build guide. That keeps the file small, and the person who opens it gets only the design.

## Opening one

Press ⌘K and choose Open Scene File, or pick **File** ▸ **Open Scene File**, then choose the `.basecase` file. You can also drag the file onto the canvas.

Basecase opens the scene in a new tab beside the one you were in, or in the current tab if it's empty. It also saves the scene to your Library, so it's still there after a restart.

If you open a damaged file, or one that isn't a Basecase scene, Basecase tells you in a toast and opens nothing. If the file comes from a newer Basecase, it asks you to update first.

![⌘K with Open Scene File highlighted](/changelog/share-scenes-as-files/open.png)

## Bringing in meshes

You can bring models from other apps in as parts. Right-click an empty spot on the canvas, choose Import Mesh and pick one or more files. Import Mesh is also in ⌘K and under **File** ▸ **Import Mesh**.

Each file becomes its own part, selected and ready to move. Basecase tags it as printed PLA or PETG, so the Build tab counts it toward filament.

Dropping mesh files on the canvas does the same. Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE.

![The canvas's right-click menu with Import Mesh highlighted](/changelog/share-scenes-as-files/import-mesh.png)

Read [Share a scene](/help/share-a-scene) and [Open a shared scene](/help/open-a-shared-scene) for the steps.
