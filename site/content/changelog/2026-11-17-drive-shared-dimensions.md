---
title: Drive dimensions from shared parameters
date: 2026-11-17
image: /changelog/drive-shared-dimensions/cover.png
---

You can connect several editable robot dimensions to one named value. Change a chassis width in the desktop app and regenerate its related plates and mounting patterns together.

Open **Edit Parameters** in the command palette, then declare a value and bind dimensions through the Inspector. You can bind editable primitives, numeric OpenSCAD assignments and dimensional Sketch constraints. You can’t bind catalog product dimensions.

Changing a rover's chassis width used to leave its mounting plate and hole pattern behind. Bind the deck to `width` and its mounting spacing to `width - 40 mm` to keep them connected.

Basecase compiles assignments on each affected OpenSCAD part together. After regeneration succeeds, you get the geometry, declarations, supported Sketch references and mates in one undoable edit. If a target fails, you keep the previous complete design.

You save bindings with the scene file, and Basecase checks them when you reopen it. Unbind dimensions before transferring parts between scenes through the clipboard or Library.

Steps are in [Link dimensions with shared parameters](/help/link-dimensions-with-shared-parameters).
