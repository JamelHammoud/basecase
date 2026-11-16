---
title: Export a robot kit
date: 2026-11-15
collection: build-and-print
type: task
order: 9
keywords:
  - manufacturing
  - packing list
  - servo sheet
  - plates
  - kit
related:
  - import-and-export-formats
  - export-a-robot-package
  - robot-kit-contents
covers:
  - src/kit/
  - src/workspace/kitExport.ts
  - src/workspace/useKitExport.ts
  - src/guide/generateGuide.ts
---

Save plates, assembly instructions, packing quantities and matching joint identities in one manufacturing archive.

Your scene must have movable joints with one exact catalog actuator per driven joint. You can’t include sheet parts or unsupported fabrication.

1. At the top right, click **Export**.
2. Choose **Kit**.

![The Export menu with Kit available for the arm](/help/export-a-robot-kit/menu.png)

3. In your downloads, unzip `<scene>-kit.zip`.
4. In the unpacked folder, open `build-guide.html` in a browser.

Basecase saves the archive to your downloads. To discard the export, click **Cancel** in the progress toast.

![The arm after the kit archive has downloaded](/help/export-a-robot-kit/exported.png)

You can choose **Kit** from [[⌘K]].

You can export up to 256 MB before compression. If you edit the scene during preparation, Basecase discards the export. Exporting doesn’t change readiness or program servos.

For file names, packing quantities and Checks freshness, see [Robot kit contents](/help/robot-kit-contents).

For simulation models and trained policies, use [Export a robot package](/help/export-a-robot-package).
