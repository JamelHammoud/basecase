---
title: Import meshes from other apps
date: 2026-11-01
version: 0.1.1
---

You can now bring an STL, 3MF, OBJ, PLY, FBX, GLB, glTF or DAE file into a scene as a printable part.

If you downloaded a bracket from Printables or drew a shell in another CAD app, you don't have to redraw it before it goes on your robot.

Right-click the canvas and choose Import Mesh, or drop the files on the canvas. Each file becomes one part, named after the file and placed where you clicked. Bring in several files and they land 40 mm apart.

Basecase reads STL, 3MF, PLY and OBJ files in millimeters. It reads GLB, glTF and DAE files in meters, and FBX files in their own units. A model under 1 mm across is read as meters.

Basecase welds meshes but never simplifies them, so a print keeps every triangle.

Read [Import a file](/help/import-a-file) in the help center for the steps.
