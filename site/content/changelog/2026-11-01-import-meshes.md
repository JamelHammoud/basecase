---
title: Import meshes from other apps
date: 2026-11-01
version: 0.1.1
---

You can now bring an STL, 3MF, OBJ, PLY, FBX, GLB, glTF or DAE file into a scene as a printable part.

A bracket downloaded from Printables, or a shell drawn in another CAD app, no longer needs redrawing before it can sit on your robot.

Right-click the canvas and choose Import Mesh, or drop the files on it. Each file becomes one part named after the file, placed where you clicked. Several files land 40 mm apart.

STL, 3MF, PLY and OBJ are read in millimeters, GLB, glTF and DAE in meters, and FBX in its own units. A model under 1 mm across is read as meters. Meshes are welded but never simplified, so a print keeps every triangle.

Steps are in [Import a mesh](/help/import-a-mesh).
