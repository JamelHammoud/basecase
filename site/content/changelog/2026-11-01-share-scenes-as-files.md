---
title: Share scenes as files
date: 2026-11-01
version: 0.1.1
image: /changelog/share-scenes-as-files/cover.png
---

You can now send someone a whole scene as one `.basecase` file, and they open it in their own Basecase.

Before this release, a design left the app as an image, an STL, 3MF plates or a USDZ model. Each keeps the shapes and drops the joints and the comments.

## Sending a scene

Click Export at the top right and choose Scene, or Export Scene in ⌘K and the File menu. The file lands in your downloads, named after the scene. It's the whole design: every part with its size, color and position, imported meshes included. The joints between them, comments you've pinned in 3D and the scene's goal come too.

What you've done with the design on your own machine stays there. The chat, print history, trained policies, Case tries, skills and the build guide aren't in the file. So it stays small, and someone opening it starts from the design itself.

## Opening one

Press ⌘K and choose Open Scene File, or pick **File** ▸ **Open Scene File**, then choose the `.basecase` file. You can also drag the file straight onto the canvas. Either way the scene opens in a new tab beside the one you were in, or in the current tab if it's empty. It saves to your Library, so it's there after a restart.

A file that isn't a Basecase scene, or is damaged, says so in a toast and opens nothing. A file from a newer Basecase asks you to update before it opens.

![⌘K with Open Scene File highlighted](/changelog/share-scenes-as-files/open.png)

## Bringing in meshes

Models from other apps come in as parts. Right-click an empty spot on the canvas and choose Import Mesh, or find it in ⌘K and in **File** ▸ **Import Mesh**. Then pick one or more files. Each file becomes its own part, selected and ready to move. It's tagged as a printed PLA or PETG part, so it counts toward filament in the Build tab.

Dropping mesh files on the canvas does the same.

![The canvas's right-click menu with Import Mesh highlighted](/changelog/share-scenes-as-files/import-mesh.png)

Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE.

Steps are in [Share a scene](/help/share-a-scene) and [Open a shared scene](/help/open-a-shared-scene).
