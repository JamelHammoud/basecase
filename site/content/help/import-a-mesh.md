---
title: Import a mesh
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 15
keywords:
  - stl
  - 3mf
  - obj
  - ply
  - fbx
  - glb
  - gltf
  - dae
  - collada
  - thingiverse
  - printables
  - model file
  - open file
related:
  - open-a-step-or-iges-file
  - save-a-model-to-the-library
covers:
  - src/workspace/meshImport.ts
  - src/workspace/usePartCreation.ts
  - src/workspace/useCanvasDrop.ts
  - src/workspace/exchangeCommands.tsx
  - electron/app-menu.mjs
---

Bring a model from another app into the scene as a printable part: STL, 3MF, OBJ, PLY, FBX, GLB, glTF or DAE.

1. Right-click an empty spot on the canvas.
2. Choose **Import Mesh**.
3. Pick one or more files.

Each file becomes its own part, standing where you right-clicked, selected and ready to move. A toast names what was inserted.

You can also drop the files on the canvas, choose **File** ▸ **Import Mesh**, or press [[⌘K]] and choose **Import Mesh**. The same command opens STEP and IGES files, as in [Open a STEP or IGES file](/help/open-a-step-or-iges-file).

## Units and axes

| Format | Read as | Up axis |
|---|---|---|
| STL, 3MF, PLY | Millimeters | Z |
| OBJ | Millimeters | Y |
| GLB, glTF | Meters | Y |
| DAE | Meters | As set in the file |
| FBX | Centimeters, times the file's unit scale | As set in the file |

A model under 1 mm across is read as meters instead. Meshes are never simplified, so a print keeps every triangle. FBX textures are left out.

If a file doesn't come in, follow [STEP or mesh file doesn't import](/help/troubleshoot-file-import).
