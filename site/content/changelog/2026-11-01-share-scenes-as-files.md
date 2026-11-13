---
title: Share scenes as files
date: 2026-11-01
version: 0.1.1
image: /changelog/share-scenes-as-files/cover.png
---

Export ▸ Basecase Scene saves a scene as a `.basecase` file you can send to anyone, and Open Scene File or a drop on the canvas opens one in a new tab. Import Mesh brings in STL, 3MF, OBJ, PLY, FBX, GLB and DAE files as printable parts.

## Sending a scene

Click Export at the top right and choose Basecase Scene. The file lands in your downloads, named after the scene, and it's the whole design: every part with its size, color and position, the joints between them, comments you've pinned in 3D, and the scene's goal.

What you've done with the design on your own machine stays there. Print history, trained policies, Case tries, skills and the build guide aren't in the file, so it stays small and someone opening it starts from the design itself.

## Opening one

Press ⌘K and choose Open Scene File, or pick File ▸ Open Scene File, then choose the `.basecase` file. You can also drag the file straight onto the canvas. Either way the scene opens in a new tab beside the one you were in and saves to your Library, so it's there after a restart. A file that isn't a Basecase scene, or is damaged, says so in a toast and opens nothing.

![⌘K with Open Scene File highlighted](/changelog/share-scenes-as-files/open.png)

## Bringing in meshes

Models from other apps come in as parts. Right-click an empty spot on the canvas and choose Import Mesh, or find it in ⌘K and in File ▸ Import Mesh, then pick one or more files. Each file becomes its own part, selected and ready to move, and tagged as a printed PLA or PETG part, so it counts toward filament in the Build tab. Dropping mesh files on the canvas does the same.

![The canvas's right-click menu with Import Mesh highlighted](/changelog/share-scenes-as-files/import-mesh.png)

Basecase reads STL, 3MF, OBJ, PLY, FBX, GLB, glTF and DAE.
