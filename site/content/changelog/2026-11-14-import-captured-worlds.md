---
title: Drive through captured worlds
date: 2026-11-14
image: /changelog/import-captured-worlds/video.png
---

You can now import a captured world, drive a robot through it and export camera videos of that place. A World Labs Marble export, a capture from Polycam, Scaniverse or Luma, or an environment mesh opens New Case with the world picked.

A rover's kitchen recording keeps the surrounding room in its training videos, so a vision model can learn from that place.

The import accepts one GLB, glTF or OBJ collider, with an optional SPZ or PLY splat and any linked files. The splat supplies the view, while separate collision pieces keep doorways and the space under tables open. Without a splat, the world shows its mesh with its own colors or textures.

Ground goals work with the imported world, and you can drive and record tries in it. A splat needs its collider to import. The imported splat or mesh now appears in camera tiles, the agent’s camera shots and exported dataset videos. Depth follows the collider pieces.

Steps are in [Import a captured world](/help/import-a-world).
